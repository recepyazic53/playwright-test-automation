// "VERİ BEKLİYOR" ÖNERİSİ (hızlı test kaydı; genel). Kayıt özetinde "veri gerekli" işaretli öneri (dalın değeri olmayan alanları) artık
// seçilebilir; değer SORULMAZ ve ÜRETİLMEZ:
//  - Seçilince not görünür, "Yazılacak: … senaryo (n veri bekliyor, koşu dışı)" güncellenir; kaydedince senaryo koşu dışı (kosuyaDahil=false)
//    kaydedilir, test verisinde kendi satırı açılır ve o hücreler boş kalır.
//  - Senaryo listesinde "veri bekliyor: X, Y" rozeti; senaryo ekranında "Veri bekliyor" uyarısı ve "Değerleri doldur" (Test verisi'nde satır
//    açılır, boş hücreler vurgulanır; gizli sütun maskeli girilir).
//  - Çalıştırılırsa açık hata: "Şu alanların değeri yok: … — test verisinde doldurun" (tarayıcı uygulamaya istek atmaz).
//  - Hücreler doldurulunca rozet kalkar; senaryo ekranı tek tıkla "Koşuya dahil et" önerir (otomatik değil); normal koşu girilen değerlerle geçer.
//  - 1440 ve 390 px'te taşma yok.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (veri-duragi-fikstur.ts > /etiketli/); geçici veritabanı; veri/ klasörüne dokunulmaz.
// Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { bekleyenAlanlar, veriBekliyorAyikla, veriBekliyorMesaji } from '../../scripts/platform/senaryolar/veri-bekliyor.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

/** Ekran görüntülerinin kopyalanacağı klasör (isteğe bağlı; GORUNTU_KLASORU). */
function goruntuKopyala(kaynak: string, ad: string): void {
  if (!process.env.GORUNTU_KLASORU) return;
  mkdirSync(process.env.GORUNTU_KLASORU, { recursive: true });
  copyFileSync(kaynak, join(process.env.GORUNTU_KLASORU, ad));
}

test('kural (saf): bekleyen hücreler tablonun güncel hâlinden; gizli sütunda doluGizli; tablo / satır yoksa yine bekliyor; mesaj', () => {
  const liste = [
    { etiket: 'A no', tabloId: 't1', sutun: 'A no', satirId: 'r1' },
    { etiket: 'B', tabloId: 't1', sutun: 'B', satirId: 'r1' },
    { etiket: 'C', tabloId: 'yok', sutun: 'C', satirId: 'r9' },
    { etiket: '', tabloId: 't1', sutun: 'D', satirId: 'r1' }
  ];
  expect(veriBekliyorAyikla(liste)).toHaveLength(3);
  expect(veriBekliyorAyikla([])).toBeNull();
  const tablolar = [{ id: 't1', ad: 'Kayıt', sutunlar: [{ ad: 'A no', gizli: true }, { ad: 'B' }], satirlar: [{ id: 'r1', ad: 'Satır', degerler: { 'A no': null, B: '' }, doluGizli: [] as string[] }] }];
  expect(bekleyenAlanlar(liste, tablolar).map((x) => x.etiket)).toEqual(['A no', 'B', 'C']);
  tablolar[0].satirlar[0] = { id: 'r1', ad: 'Satır', degerler: { 'A no': null, B: 'dolu' }, doluGizli: ['A no'] };
  expect(bekleyenAlanlar(liste, tablolar)).toEqual([{ ...liste[2], tablo: null, satirAdi: null }]);
  expect(veriBekliyorMesaji([{ etiket: 'X' }, { etiket: 'Y' }, { etiket: 'X' }])).toBe('Şu alanların değeri yok: X, Y — test verisinde doldurun.');
});

test.describe('Nöbetçi taraması özeti → veri bekliyor → test verisi → koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Bekliyor-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  const u = new VeriDuragiUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde?: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      if (o.durum === 'kesifOnay' && !durumlar.includes('kesifOnay')) { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };
  const senaryolar = async (): Promise<Nesne[]> => (await basarili(`/platform/senaryolar?projeId=${projeId}`)).senaryolar as Nesne[];
  const calistir = async (senaryoId: string): Promise<Nesne> => {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'veri-bekliyor-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Bekleyen Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('veri gerekli öneri seçilir, veri bekliyor olarak boş kaydedilir; rozet, açık koşu hatası, Değerleri doldur, rozet kalkar, koşuya dahil et, normal koşu', async () => {
    test.setTimeout(900_000);
    // 1) Hızlı test (Özel dalı) — değerler API ile; Tüzel dalının alanları (Vergi no, İş telefonu) için değer girilmez.
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/etiketli/', ekranAdi: 'Başvuru', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
    await basarili('/platform/hizli-test/veri', {
      id, degerler: {
        [alanBul(o, 'Ad').anahtar]: deger('Deneme Kişi'), [alanBul(o, 'Doğum tarihi').anahtar]: deger('13.04.1998'),
        [alanBul(o, 'Kimlik no').anahtar]: deger('12345678901'), [alanBul(o, 'Cep telefonu').anahtar]: deger('5321234567'), [alanBul(o, 'Seçenek no').anahtar]: deger('2')
      }
    });
    o = await bekle(id, ['karar'], 180);
    if (!u.etiketliKayitlar.some((x) => x.tip === 'O')) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    const baslik = 'Başvuru — Özel';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    const tuzel = (oz.senaryolar as Nesne[]).find((x) => String(x.baslik).includes('Kişi tipi: Tüzel')) as Nesne;
    expect(tuzel, JSON.stringify(oz.senaryolar)).toBeTruthy();
    expect(tuzel.veriGerekli).toEqual(['Vergi no', 'İş telefonu']);
    expect((tuzel.eksikAlanlar as Nesne[]).map((x) => x.etiket)).toEqual(['Vergi no', 'İş telefonu']);
    expect(tuzel.gerekce).toContain('seçilirse “veri bekliyor” olarak koşu dışı kaydedilir');

    // 2) Özet (arayüz): veri gerekli öneri seçilebilir; not + sayı; 1440 / 390 px taşma yok; kaydet.
    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    let tuzelId = '';
    try {
      await page.goto(`/#/hizli-test/ozet/${id}`);
      const ozet = page.locator('.hizli-ozet-karti');
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible({ timeout: 30_000 });
      const kutu = ozet.getByRole('checkbox', { name: `${String(tuzel.baslik)} senaryosunu ekle` });
      await expect(kutu).toBeEnabled();
      await expect(kutu).not.toBeChecked();
      const satir = ozet.locator('.hizli-oneri-veri-gerekli', { has: page.getByRole('checkbox', { name: `${String(tuzel.baslik)} senaryosunu ekle` }) });
      await expect(satir.locator('.rozet')).toHaveText('veri gerekli: Vergi no, İş telefonu');
      await expect(satir.locator('.hizli-veri-bekliyor-notu')).toBeHidden();
      const durum = ozet.locator('p[role=status]').last();
      await expect(durum).toHaveText(/; 1 senaryo$/);
      await kutu.check();
      await expect(satir.locator('.hizli-veri-bekliyor-notu')).toContainText('“Veri bekliyor” olarak koşu dışı kaydedilir: Vergi no, İş telefonu için değer sorulmaz ve üretilmez');
      await expect(durum).toHaveText(/; 2 senaryo \(1 veri bekliyor, koşu dışı\)$/);
      await tasmaYok(page);
      const g1440 = test.info().outputPath('veri-bekliyor-ozet-1440.png');
      await page.screenshot({ path: g1440, fullPage: true });
      goruntuKopyala(g1440, 'veri-bekliyor-ozet-1440.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(satir.locator('.hizli-veri-bekliyor-notu')).toBeVisible();
      await tasmaYok(page);
      const g390 = test.info().outputPath('veri-bekliyor-ozet-390.png');
      await page.screenshot({ path: g390, fullPage: true });
      goruntuKopyala(g390, 'veri-bekliyor-ozet-390.png');
      await page.setViewportSize({ width: 1440, height: 900 });
      await ozet.getByRole('button', { name: 'Onayla ve kaydet' }).click();
      await expect(page.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
      const sonuc = page.locator('.hizli-veri-bekliyor-sonucu');
      await expect(sonuc).toContainText('1 senaryo “veri bekliyor” olarak koşu dışı kaydedildi.');
      await expect(sonuc.getByRole('link', { name: String(tuzel.baslik) })).toBeVisible();
      await expect(sonuc).toContainText('veri bekliyor: Vergi no, İş telefonu');

      // 3) Kayıt: senaryo koşu dışı, tabloda boş hücreli satır, senaryo o satıra bağlı (değer yok).
      const ss = await senaryolar();
      const t = ss.find((x) => x.baslik === tuzel.baslik) as Nesne;
      expect(t, JSON.stringify(ss.map((x) => x.baslik))).toBeTruthy();
      tuzelId = String(t.id);
      expect(t.kosuyaDahil).toBe(false);
      expect(t.veriBekliyor).toEqual(['Vergi no', 'İş telefonu']);
      expect(ss.find((x) => x.baslik === baslik)?.kosuyaDahil).toBe(true);
      expect(ss.find((x) => x.baslik === baslik)?.veriBekliyor).toBeUndefined();
      const detay = (await basarili(`/platform/senaryo?id=${tuzelId}&ortamId=${ortamId}`)).senaryo as Nesne;
      const bekleyen = detay.veriBekliyor.bekleyen as Nesne[];
      expect(bekleyen.map((x) => x.etiket)).toEqual(['Vergi no', 'İş telefonu']);
      expect(detay.veriBekliyor.toplam).toBe(2);
      const tablolar = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
      const tablo = tablolar.find((x) => x.id === bekleyen[0].tabloId) as Nesne;
      const bekSatir = (tablo.satirlar as Nesne[]).find((r) => r.id === bekleyen[0].satirId) as Nesne;
      expect(bekSatir.ad).toBe(String(tuzel.baslik).replace(/[.[\]{}$<>&|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 100).trim());
      for (const b of bekleyen) {
        expect(b.tabloId).toBe(tablo.id);
        expect(bekSatir.degerler[b.sutun] ?? null).toBeNull();
        expect(bekSatir.doluGizli ?? []).not.toContain(b.sutun);
      }
      // Vergi no gizli sütunda (mevcut gizli sütun kuralı).
      expect((tablo.sutunlar as Nesne[]).find((c) => c.ad === bekleyen[0].sutun)?.gizli).toBe(true);
      // Senaryo değerleri satırın grubundan (${Tablo[dal].Sütun}); kişi tipi Tüzel.
      const veri = JSON.stringify(detay.veri);
      for (const b of bekleyen) expect(veri).toContain(`\${${tablo.ad}[dal].${b.sutun}}`);
      expect(detay.tabloSecimleri[`${tablo.id}|dal`]).toEqual({ $satir: bekSatir.id });

      // 4) Koşu: açık hata, sayfaya hiç gönderim yok, değer üretilmez.
      const once = u.etiketliKayitlar.length;
      const r = await calistir(tuzelId);
      expect(r.durum).not.toBe('basarili');
      expect(JSON.stringify(r)).toContain('Şu alanların değeri yok: Vergi no, İş telefonu — test verisinde doldurun.');
      expect(u.etiketliKayitlar.length).toBe(once);

      // 5) Senaryo listesi rozeti; senaryo ekranında uyarı ve "Değerleri doldur".
      await page.goto('/#/senaryolar');
      const listeSatiri = page.locator(`tr[data-senaryo="${tuzelId}"]`);
      await expect(listeSatiri.locator('.veri-bekliyor-rozeti')).toHaveText('veri bekliyor: Vergi no, İş telefonu', { timeout: 30_000 });
      await page.goto(`/#/senaryolar/duzenle/${tuzelId}`);
      const not = page.locator('.veri-bekliyor-notu');
      await expect(not).toContainText('Veri bekliyor: Vergi no, İş telefonu', { timeout: 30_000 });
      await tasmaYok(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(not).toBeVisible();
      await tasmaYok(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await not.getByRole('link', { name: 'Değerleri doldur' }).click();
      await expect(page).toHaveURL(/#\/veri\/satir\//);

      // 6) Test verisi: tablo açık, satır ve boş hücreler vurgulu; gizli sütun maskeli; doldur + Kaydet.
      const hedefSatir = page.locator('tr.veri-bekliyor-satiri');
      await expect(hedefSatir).toHaveCount(1, { timeout: 30_000 });
      await expect(hedefSatir.locator('td.veri-bekliyor-hucresi')).toHaveCount(2);
      const no = await hedefSatir.locator('td.sira').innerText();
      const vergi = hedefSatir.getByLabel(`${no}. satır ${bekleyen[0].sutun}`, { exact: true });
      const tel = hedefSatir.getByLabel(`${no}. satır ${bekleyen[1].sutun}`, { exact: true });
      await expect(vergi).toHaveAttribute('type', 'password');
      // İlk boş (vurgulu) hücreye odaklanılır.
      await expect(hedefSatir.locator('td.veri-bekliyor-hucresi input').first()).toBeFocused();
      await tasmaYok(page);
      await vergi.fill('1234567890');
      await tel.fill('2125550000');
      await expect(hedefSatir.locator('td.veri-bekliyor-hucresi')).toHaveCount(0);
      await page.locator('.tablo-duzenleyici').getByRole('button', { name: 'Kaydet', exact: true }).click();
      await expect(page.locator('.tablo-duzenleyici .rozet', { hasText: 'kaydedilmemiş değişiklik' })).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(async () => (await senaryolar()).find((x) => x.id === tuzelId)?.veriBekliyor, { timeout: 30_000 }).toEqual([]);

      // 7) Rozet kalktı; senaryo hâlâ koşu dışı (otomatik dahil edilmez); senaryo ekranı "Koşuya dahil et" önerir.
      const ss2 = await senaryolar();
      expect(ss2.find((x) => x.id === tuzelId)?.veriBekliyor).toEqual([]);
      expect(ss2.find((x) => x.id === tuzelId)?.kosuyaDahil).toBe(false);
      await page.goto('/#/senaryolar');
      await expect(page.locator(`tr[data-senaryo="${tuzelId}"]`)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(`tr[data-senaryo="${tuzelId}"] .veri-bekliyor-rozeti`)).toHaveCount(0);
      await page.goto(`/#/senaryolar/duzenle/${tuzelId}`);
      const not2 = page.locator('.veri-bekliyor-notu');
      await expect(not2).toContainText('Değerler dolduruldu.', { timeout: 30_000 });
      await not2.getByRole('button', { name: 'Toplu koşuya dahil et' }).click();
      await expect(not2).toContainText('Toplu koşuya dahil edildi.');
      await tasmaYok(page);
      expect((await senaryolar()).find((x) => x.id === tuzelId)?.kosuyaDahil).toBe(true);
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }

    // 8) Normal koşu: Tüzel dalı girilen değerlerle (doğum tarihi gönderilmez).
    const once = u.etiketliKayitlar.length;
    const r = await calistir(tuzelId);
    expect(r.durum, JSON.stringify(r.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(u.etiketliKayitlar.slice(once)).toEqual([expect.objectContaining({ tip: 'T', ad: 'Deneme Kişi', kimlik: '1234567890', telefon: '2125550000', secenekNo: '2' })]);
    expect(u.etiketliKayitlar.at(-1)?.dogum).toBeUndefined();
  });
});
