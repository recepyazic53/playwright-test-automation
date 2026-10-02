// ZİNCİRİN SON HALKASI + GÖRÜNÜRLÜĞÜ BELİRLEYEN ÖN SEÇİM (hızlı test). Gerçek bir talep formunda görülen iki sorunun koruması:
//  1) Uzun adres zinciri (İl → İlçe → Belde/Köy → Mahalle → Cadde/Sokak → Bina No → Daire/Kapı No) son halkada kaçıyordu: denenen ilk
//     değerlerde (ilk / orta / son bina) daire yok, son liste istek bittikten SONRA zamanlayıcıyla doluyor, iki sütunlu düzende DOM sırası
//     görsel sıradan farklı, Bina listesi seçenekler gelirken kilitli ve süslü bir kutuyla sarılı. Keşif zinciri 7. halkaya kadar kurmalı;
//     hiç kesinleşmezse bağ "belirsiz" kalır ve veri durağında yine "↓ … seçeneklerini getir" gösterilir (seçenek gelirse kesinleşir).
//  2) Sayfada önseçili "Başvuran tipi" (Özel / Tüzel) radyosu veri durağında EN ÜSTTE "Önce bunu seçin" ile tüm seçenekleriyle sorulur;
//     Tüzel seçilince Tüzel alanları sorulur, Özel alanları kalkar; seçim getir düğmesi beklenmeden sayfaya uygulanır; kaydedilen
//     senaryo normal koşuda Tüzel dalını yürütür. Zincirsiz / koşulsuz sayfada bu bölüm yoktur.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (bagli-liste-fikstur.ts > /yangin/); geçici veritabanı; veri/ klasörüne dokunulmaz. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { ZINCIR_EN_COK_ACILIS, acilisSiniri, belirsizBaglar } from '../../scripts/platform/tarama/zincir-kesfi.mjs';
import { BagliListeUygulamasi, YanginUygulamasi } from './bagli-liste-fikstur';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const ZINCIR = 'İl → İlçe → Belde/Köy → Mahalle → Cadde/Sokak → Bina No → Daire/Kapı No';

test.describe('saf kurallar', () => {
  test('belirsiz bağ: boş liste, sayfa sırasında kendinden ÖNCE gelen en yakın yaprağa; yoksa sırası en yakına; yaprak yoksa bağ yok', () => {
    const sira = (k: string) => ({ il: 0, cadde: 1, ilce: 2, bina: 3, belde: 4, daire: 5, mahalle: 6, tek: 9 } as Record<string, number>)[k] ?? 99;
    expect(belirsizBaglar(['daire'], ['bina'], sira)).toEqual([{ ust: 'bina', alt: 'daire' }]);
    expect(belirsizBaglar(['daire'], ['mahalle', 'bina'], sira)).toEqual([{ ust: 'bina', alt: 'daire' }]);
    expect(belirsizBaglar(['cadde'], ['bina'], sira)).toEqual([{ ust: 'bina', alt: 'cadde' }]);
    expect(belirsizBaglar(['daire'], [], sira)).toEqual([]);
  });

  test('sayfa açılış sınırı zincir sayısı ve uzunluğuyla büyür (en az varsayılan, en çok 150)', () => {
    expect(acilisSiniri(1, 3, 8)).toBe(ZINCIR_EN_COK_ACILIS);
    expect(acilisSiniri(3, 3, 8)).toBe(75);
    expect(acilisSiniri(6, 5, 10)).toBe(150);
  });
});

test.describe('hızlı test (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Yangin-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  const yangin = new YanginUygulamasi();
  const bagli = new BagliListeUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const isBitsin = async (): Promise<void> => {
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
  };
  const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  const arayuz = async (id: string): Promise<{ page: Page; kapat: () => Promise<void>; hatalar: string[] }> => {
    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/o/${id}`);
    await expect(page.locator('.hizli-soru').getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
    return { page, hatalar, kapat: () => tarayici.close() };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'zincir-sonu-'));
    fikstur = await yerelSunucu((i) => yangin.isle(i) ?? bagli.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Yangın Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('zincir 7. halkaya kadar kurulur (ilk denenen binalarda daire yok, son halka gecikmeli, Bina kilitli + süslü); Daire seçenekleri getir beklenmeden gelir; Tüzel seçilince Tüzel alanları sorulur; kaydedilen senaryo normal koşuda Tüzel dalını yürütür', async () => {
    test.setTimeout(900_000);
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/yangin/?ozel=1', ekranAdi: 'Yangın talebi', izin: 'evet', cumle: 'Talep al düğmesine bas, "Talep hazır" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 600);
    expect(yangin.talepler).toEqual([]);
    expect(o.zincir, JSON.stringify(o.gunluk)).toEqual([ZINCIR]);
    const daire = alanBul(o, 'Daire/Kapı No');
    expect(daire.bagli).toMatchObject({ ustEtiket: 'Bina No', belirsiz: false, bekliyor: true });
    // Görünürlüğü belirleyen seçim: Başvuran tipi (sayfada Özel seçili).
    const tip = alanBul(o, 'Başvuran Tipi');
    expect(tip).toMatchObject({ tur: 'radio', kontrol: true, sayfadaki: 'O' });
    expect(alanBul(o, 'Vergi No').kosul).toMatchObject({ secim: tip.anahtar, degerler: ['T'] });
    expect(alanBul(o, 'T.C. Kimlik No').kosul).toMatchObject({ secim: tip.anahtar, degerler: ['O'] });

    const { page, kapat, hatalar } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      // "Önce bunu seçin" en üstte, sayfadaki seçim (Özel) önseçili; Özel alanları soruluyor, Tüzel alanları yok.
      const onsecim = soru.locator('.hizli-onsecim');
      await expect(onsecim.getByRole('heading', { name: 'Önce bunu seçin' })).toBeVisible();
      await expect(onsecim.getByRole('radio', { name: 'Özel' })).toBeChecked();
      await expect(onsecim).toContainText('Sayfada “Özel” seçili');
      const ilkKonum = await soru.evaluate((k) => [...k.querySelectorAll('.hizli-onsecim, .hizli-alanlar')].map((x) => x.className));
      expect(ilkKonum[0]).toContain('hizli-onsecim');
      await expect(soru.getByLabel('T.C. Kimlik No', { exact: true })).toBeVisible();
      await expect(soru.getByLabel('Vergi No', { exact: true })).toHaveCount(0);
      // Zincir: her halkada üst seçilince seçim anında sayfaya uygulanır, alt listenin seçenekleri getir düğmesine basmadan gelir (son
      // halka Daire dahil).
      const yol: Array<[string, string, string]> = [
        ['İl', 'DENİZKENT', 'İlçe'], ['İlçe', 'ATAKUM', 'Belde/Köy'], ['Belde/Köy', 'MERKEZ', 'Mahalle'], ['Mahalle', 'CUMHURİYET MH.', 'Cadde/Sokak'],
        ['Cadde/Sokak', 'LALE CD.', 'Bina No'], ['Bina No', 'No 2', 'Daire/Kapı No']
      ];
      for (const [ust, secim, alt] of yol) {
        await soru.getByLabel(ust, { exact: true }).selectOption({ label: secim });
        try {
          await expect(soru.getByLabel(alt, { exact: true }), alt).toBeEnabled({ timeout: 90_000 });
        } catch (h) {
          const d = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
          throw new Error(`${alt} gelmedi: durum=${d.durum} not=${d.soru?.not} hata=${d.sonHata} alan=${JSON.stringify(d.soru?.alanlar?.find((x: Nesne) => x.etiket === alt))} günlük=${JSON.stringify(d.gunluk?.slice(-6))} — ${String(h).slice(0, 300)}`);
        }
      }
      await expect(soru.getByLabel('Daire/Kapı No', { exact: true }).locator('option')).toHaveText(['Seçin', 'Daire 21', 'Daire 22']);
      await expect(soru.locator('.hizli-zincir-gostergesi')).toContainText(`Bağlı alanlar: ${ZINCIR}`);
      await soru.getByLabel('Daire/Kapı No', { exact: true }).selectOption({ label: 'Daire 21' });
      // Tüzel: alanlar anında değişir ve seçim getir düğmesi beklenmeden sayfaya uygulanır (odak seçimde kalır).
      await onsecim.getByRole('radio', { name: 'Tüzel' }).check();
      await expect(soru.getByLabel('Vergi No', { exact: true })).toBeVisible();
      await expect(soru.getByLabel('Unvan', { exact: true })).toBeVisible();
      await expect(soru.getByLabel('T.C. Kimlik No', { exact: true })).toHaveCount(0);
      await expect(onsecim.getByRole('button', { name: 'Bu seçime göre alanları getir', exact: true })).toHaveCount(0);
      await expect(onsecim).toContainText('Sayfada “Tüzel” seçili', { timeout: 60_000 });
      await expect(soru.locator('.not-kutusu')).toContainText('“Başvuran Tipi” = “Tüzel” sayfaya uygulandı');
      await expect(onsecim.getByRole('radio', { name: 'Tüzel' })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const goruntu = test.info().outputPath('kosullu-secim-zincir-1440.png');
      await page.screenshot({ path: goruntu, fullPage: true });
      if (process.env.GORUNTU_KLASORU) { mkdirSync(process.env.GORUNTU_KLASORU, { recursive: true }); copyFileSync(goruntu, join(process.env.GORUNTU_KLASORU, 'kosullu-secim-zincir-1440.png')); }
      await expect(soru.getByLabel('T.C. Kimlik No', { exact: true })).toHaveCount(0);
      // Zincir değerleri korunur.
      await expect(soru.getByLabel('Daire/Kapı No', { exact: true })).toHaveValue('D21');
      await soru.getByLabel('Vergi No', { exact: true }).fill('1234567890');
      await soru.getByLabel('Unvan', { exact: true }).fill('Deneme Ticaret');
      expect(yangin.talepler).toEqual([]);
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(hatalar).toEqual([]);
    } finally { await kapat(); }
    // "Şimdi ne yapayım?": "Talep al"a basılır (Tüzel dalının değerleriyle).
    o = await bekle(id, ['karar']);
    if (!yangin.talepler.length) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Talep al');
      expect(aday, JSON.stringify(o.soru.adaylar)).toBeTruthy();
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    expect(yangin.talepler.at(-1)).toMatchObject({ tip: 'T', il: '55', ilce: '5501', bina: '5501-M-1-C1|B2', daire: 'D21', vergi: '1234567890', unvan: 'Deneme Ticaret' });
    expect(yangin.talepler.at(-1)?.tc).toBeUndefined();
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Talep hazır')) as string;
    expect(bitti, JSON.stringify(o.soru.etiketler)).toBeTruthy();
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    await basarili('/platform/hizli-test/ozet', { id, baslik: 'Yangın — Tüzel' });
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Yangın — Tüzel', senaryoIndeksleri: [] });
    // Model: Daire bağımlılığı (Bina No'ya) ve Tüzel alanlarının görünürlük koşulu.
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    const alanlar = (model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const m = (secici: string) => alanlar.find((a) => a.konum?.secici === secici) as Nesne;
    expect(m('#daire').bagimlilik?.alan, JSON.stringify(m('#daire'))).toBe(m('#bina').id);
    // Normal koşu: senaryo Tüzel dalını yürütür (Özel alanları atlanır, Tüzel alanları doldurulur).
    const once = yangin.talepler.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId: String(k.senaryoId), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    const senaryo = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)).senaryo as Nesne;
    expect(sonuc.durum, `${JSON.stringify(sonuc.hataMesaji).slice(0, 200)} veri=${JSON.stringify(senaryo?.veri)} sonuc=${JSON.stringify(sonuc).replace(/"goruntu[^"]*":"[^"]{200,}"/g, '"goruntu":"…"').slice(0, 6000)} istekler=${JSON.stringify(yangin.istekler.slice(-8))}`).toBe('basarili');
    expect(yangin.talepler.slice(once)).toEqual([expect.objectContaining({ tip: 'T', daire: 'D21', vergi: '1234567890', unvan: 'Deneme Ticaret' })]);
  });

  test('ilk denenen değerlerin HİÇBİRİNDE alt liste dolmazsa bağ "belirsiz" kalır: Devam kilitlenmez; bina seçilince seçenekler anında gelir ve bağ kesinleşir', async () => {
    test.setTimeout(600_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/yangin/?dairesiz=1', ekranAdi: 'Yangın dairesiz', izin: 'sor' })).id);
    let o = await bekle(id, ['veri'], 600);
    expect(o.zincir).toEqual([ZINCIR]);
    expect(alanBul(o, 'Daire/Kapı No').bagli).toMatchObject({ ustEtiket: 'Bina No', belirsiz: true });
    expect(JSON.stringify(o.gunluk)).toContain('kesinleşmedi');
    // Zincir API ile Bina No'ya kadar (dairesi olan bina: GÜL SK. → No 20).
    const yol: Array<[string, string]> = [['İl', '55'], ['İlçe', '5501'], ['Belde/Köy', '5501-M'], ['Mahalle', '5501-M-1'], ['Cadde/Sokak', '5501-M-1-C2'], ['Bina No', '5501-M-1-C2|B20']];
    const degerler: Nesne = {};
    for (const [etiket, d] of yol.slice(0, -1)) {
      degerler[alanBul(o, etiket).anahtar] = deger(d);
      await basarili('/platform/hizli-test/veri', { id, degerler, zincir: alanBul(o, etiket).anahtar });
      o = await bekle(id, ['veri']);
    }
    degerler[alanBul(o, 'Bina No').anahtar] = deger('5501-M-1-C2|B20');
    const { page, kapat, hatalar } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.locator('.hizli-alan[data-anahtar="#daire"]')).toContainText('keşifte kesinleşmedi');
      // Belirsiz bağ "Devam et"i kilitlemez.
      await expect(soru.getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
      // Bina seçilince anında sayfaya uygulanır; dairenin seçenekleri getir düğmesine basmadan gelir.
      await soru.getByLabel('Bina No', { exact: true }).selectOption({ label: 'No 20' });
      await expect(soru.getByLabel('Daire/Kapı No', { exact: true })).toBeEnabled({ timeout: 60_000 });
      await expect(soru.getByLabel('Daire/Kapı No', { exact: true }).locator('option')).toHaveText(['Seçin', 'Daire 1', 'Daire 2']);
      await expect(soru.locator('.hizli-alan[data-anahtar="#daire"]')).not.toContainText('kesinleşmedi');
      expect(hatalar).toEqual([]);
    } finally { await kapat(); }
    o = await bekle(id, ['veri']);
    expect(alanBul(o, 'Daire/Kapı No').bagli).toMatchObject({ belirsiz: false, getirildi: true });
    await api('/platform/hizli-test/iptal', { id });
  });

  test('zincirsiz ve koşulsuz sayfada eski davranış: "Önce bunu seçin" bölümü yok', async () => {
    test.setTimeout(240_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/zincirsiz/', ekranAdi: 'Zincirsiz', izin: 'sor' })).id);
    const o = await bekle(id, ['veri'], 240);
    expect((o.soru.alanlar as Nesne[]).some((a) => a.kontrol)).toBe(false);
    const { page, kapat } = await arayuz(id);
    try {
      const soru = page.locator('.hizli-soru');
      await expect(soru.locator('.hizli-onsecim')).toHaveCount(0);
      await expect(soru.getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
    } finally { await kapat(); await api('/platform/hizli-test/iptal', { id }); }
  });
});
