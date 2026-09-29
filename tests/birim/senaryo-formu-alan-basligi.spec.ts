// KORUMA TESTİ — SENARYO FORMUNDA ALAN BAŞLIĞI YERLEŞİMİ: dar sütunlu bir bölümde yan yana dört alan (radyo, koşullu radyo, koşullu
// metin, koşullu + tabloya bağlı metin; "koşullu", "Mutlaka görünmeli", "Tablodan", "Bilerek boş bırak" çipleriyle). Her alanın başlığı
// önce etiket, altında seçenekler şeridi; başlık öğeleri birbirine ve başka alanın kutusuna binmez; aynı satırdaki alanların girdileri
// aynı hizadan başlar (±2 px). 1440, 1024 ve 390 px'te ölçülür. Ayrı Nöbetçi, geçici veritabanı; dış istek yok. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Json = Record<string, unknown>;

const EKRAN = 'Taraf formu';
const ALANLAR = ['taraf', 'kisiTipi', 'cepTelefonu', 'kimlikNo'];

const alan = (id: string, tip: string, etiket: string, ek: Json = {}): Json => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: true, ...ek
});

function tarafModeli(): Json {
  const kosullu = { gorunurluk: { kosul: 'calismaAninda' } };
  return {
    semaSurumu: 2, tur: 'ekran', id: 'taraf-formu', ad: EKRAN, aciklama: 'Alan başlığı fikstürü (değerler sahte).', ekranUrl: '/taraf', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' },
    kosullar: { calismaAninda: { aciklama: 'Ekranda görünürse', ifade: { calismaZamani: 'gorunurse' } } },
    adimlar: [{
      id: 'taraf', sira: 1, baslik: 'Taraf bilgileri',
      bolumler: [{ id: 'tarafBolumu', baslik: 'Taraf', alanlar: [
        alan('taraf', 'radyo', 'Taraf', { secenekler: [{ deger: 'K', metin: 'Kişi' }, { deger: 'U', metin: 'Kurum' }], seceneklerDurumu: 'tam' }),
        alan('kisiTipi', 'radyo', 'Kişi tipi', { ...kosullu, secenekler: [{ deger: 'Y', metin: 'Yerli' }, { deger: 'B', metin: 'Yabancı' }], seceneklerDurumu: 'tam' }),
        alan('cepTelefonu', 'metin', 'Cep telefonu', kosullu),
        alan('kimlikNo', 'metin', 'Kimlik no', kosullu)
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Sayfada: bölümdeki alanların başlık öğeleri ve girdi üst kenarları. */
type Olcum = {
  alanlar: Array<{ id: string; kutu: { sol: number; sag: number; ust: number; alt: number }; girdiUst: number; ogeler: Array<{ ad: string; sol: number; sag: number; ust: number; alt: number }> }>;
  tasma: number;
};
async function olc(page: Page): Promise<Olcum> {
  return page.evaluate((idler) => {
    const dikdortgen = (e: Element) => { const r = e.getBoundingClientRect(); return { sol: r.left, sag: r.right, ust: r.top, alt: r.bottom }; };
    const alanlar = idler.map((id) => {
      const kap = document.querySelector(`[data-alan="${id}"]`) as HTMLElement;
      const ust = kap.querySelector('.alan-ust') as HTMLElement;
      const ogeler = [...ust.querySelectorAll(':scope > label, .sag > *')].filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => ({ ad: `${id}: ${(e.textContent || '').trim().slice(0, 24) || e.className}`, ...dikdortgen(e) }));
      const girdi = [...kap.querySelectorAll('input:not([type="checkbox"]), select, textarea, .radyo-grubu')].find((e) => !ust.contains(e)) as HTMLElement;
      return { id, kutu: dikdortgen(kap), girdiUst: girdi.getBoundingClientRect().top, ogeler };
    });
    return { alanlar, tasma: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, ALANLAR);
}

const kesisir = (a: { sol: number; sag: number; ust: number; alt: number }, b: { sol: number; sag: number; ust: number; alt: number }) =>
  Math.min(a.sag, b.sag) - Math.max(a.sol, b.sol) > 0.5 && Math.min(a.alt, b.alt) - Math.max(a.ust, b.ust) > 0.5;

test.describe('senaryo formu: alan başlığı yerleşimi (127.0.0.1)', () => {
  const PAROLA = `Gecici-Taraf-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let ekranId = '';
  const api = (yol: string, govde?: Json) => nobetciApi(nobetci, yol, govde) as Promise<Json>;
  const basarili = async (yol: string, govde?: Json) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'alan-basligi-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Taraf Projesi' })).proje as Json).id);
    const ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam as Json).id);
    const paket = {
      tur: 'sayfa-paketi', surum: 1,
      meta: { ekran: { anahtar: 'taraf-formu', ad: EKRAN, urlYolu: '/taraf' }, olusturan: 'birim testi', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
      model: tarafModeli(), senaryoOnerileri: [],
      gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
      bilinmeyenler: []
    };
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Json[]).find((e) => e.ad === EKRAN)?.id);
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişi listesi', sutunlar: [{ ad: 'Kimlik no' }], satirlar: [{ ad: 'Birinci', degerler: { 'Kimlik no': '10000000146' } }] });
    const tablo = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Array<{ id: string; ad: string }>).find((t) => t.ad === 'Kişi listesi');
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { kimlikNo: { tablo: String(tablo?.id), sutun: 'Kimlik no' } } });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('dört alanlı dar bölüm: başlık öğeleri binmez, girdiler aynı hizadan başlar (1440 / 1024 / 390 px)', async () => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/yeni/${ekranId}`);
    await expect(page.locator('[data-alan="kimlikNo"]')).toBeVisible({ timeout: 20_000 });
    // Çiplerin hepsi var: koşullu, Mutlaka görünmeli, Tablodan, Bilerek boş bırak.
    const kimlik = page.locator('[data-alan="kimlikNo"] .alan-ust');
    await expect(kimlik.locator('.kosullu-cip')).toBeVisible();
    await expect(kimlik.getByText('Mutlaka görünmeli')).toBeVisible();
    await expect(kimlik.getByRole('button', { name: /Tablodan/ })).toBeVisible();
    await expect(kimlik.getByText('Bilerek boş bırak')).toBeVisible();
    await expect(page.locator('[data-alan="kisiTipi"] .radyo-grubu')).toBeVisible();
    for (const genislik of [1440, 1024, 390]) {
      await page.setViewportSize({ width: genislik, height: 1000 });
      await page.locator('[data-bolum="tarafBolumu"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
      const o = await olc(page);
      await page.locator('[data-bolum="tarafBolumu"]').screenshot({ path: test.info().outputPath(`alan-basligi-${genislik}.png`) });
      // Başlık öğeleri kendi alan kutusunda kalır ve hiçbir başlık öğesi başka bir öğeye binmez.
      const tum = o.alanlar.flatMap((a) => a.ogeler.map((x) => ({ ...x, kutu: a.kutu })));
      const disarida = tum.filter((x) => x.sol < x.kutu.sol - 1 || x.sag > x.kutu.sag + 1).map((x) => x.ad);
      expect.soft(disarida, `${genislik}px kutu dışı`).toEqual([]);
      const binen: string[] = [];
      for (let i = 0; i < tum.length; i++) for (let j = i + 1; j < tum.length; j++) if (kesisir(tum[i], tum[j])) binen.push(`${tum[i].ad} ↔ ${tum[j].ad}`);
      expect.soft(binen, `${genislik}px binme`).toEqual([]);
      // Etiket her zaman şeridin üstünde (önce etiket, altında seçenekler).
      for (const a of o.alanlar) {
        const [etiket, ...serit] = a.ogeler;
        for (const s of serit) expect.soft(s.ust, `${genislik}px ${s.ad}`).toBeGreaterThanOrEqual(etiket.alt - 1);
      }
      // Aynı satırdaki (kutu üstü aynı) alanların girdileri aynı hizadan başlar.
      const satirlar = new Map<number, number[]>();
      for (const a of o.alanlar) {
        const k = [...satirlar.keys()].find((u) => Math.abs(u - a.kutu.ust) <= 2) ?? a.kutu.ust;
        satirlar.set(k, [...(satirlar.get(k) ?? []), a.girdiUst]);
      }
      if (genislik >= 1024) expect.soft([...satirlar.values()].some((s) => s.length > 1), `${genislik}px: yan yana alan yok`).toBe(true);
      for (const ustler of satirlar.values()) expect.soft(Math.max(...ustler) - Math.min(...ustler), `${genislik}px girdi hizası ${JSON.stringify(ustler)}`).toBeLessThanOrEqual(2);
      expect.soft(o.tasma, `${genislik}px yatay taşma`).toBeLessThanOrEqual(0);
    }
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
