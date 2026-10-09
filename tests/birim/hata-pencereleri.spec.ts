// KORUMA TESTLERİ — PROJE HATA PENCERELERİ (Ayarlar > Hata pencereleri; scripts/platform/ayarlar/hata-pencereleri.mjs,
// tests/support/model-kosucu.ts). Koşu bir adımı beklerken önce adımın kendi göstergelerine bakar; onlar bir şey söylemiyorken proje
// hata penceresi görünürse adım BEKLEMEDEN başarısız olur ve pencerenin metni iletiye yazılır. Adımın kendi başarı göstergesi görünüyorsa
// pencere yok sayılır (öncelik akışındır). Kapalı pencere kullanılmaz. Kayıt: doğrulama, en çok sayısı, tekrar eden seçici, koşuya
// görüntüsüz ve yalnız açık olanlar gider. Öğe seçme: hata türünde metne bağlı seçici üretilmez. Yalnız 127.0.0.1'deki sahte uygulama.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { HATA_PENCERESI_EN_COK, hataPencereleriniKaydet, hataPencereleriniOku, kosuHataPencereleri } from '../../scripts/platform/ayarlar/hata-pencereleri.mjs';
import { adaySirasi } from '../../scripts/platform/tarama/oge-secme-motoru';
import { secilenOgeleriAyikla } from '../../scripts/platform/tarama/oge-isaretleri.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { beklenenMesajiBekle } from '../support/beklenen-sonuc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const SONUC = 'İşlem tamamlandı';
const html = (govde: string): FiksturYaniti => ({ tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>İşlem</title></head><body>${govde}</body></html>` });

/** Tek adımlı model: Gönder'e basılır, #sonuc'ta başarı metni beklenir. Adımın kendi hata göstergesi YOK (hızlı test modeli gibi). */
const model = (ekranUrl: string, zamanAsimiSn = 20): Nesne => ({
  semaSurumu: 2, tur: 'ekran', id: 'islem', ad: 'İşlem', aciklama: 'Hata penceresi (nötr fikstür).', ekranUrl, girisGerekmez: true,
  specDosyasi: 'tests/scenarios/islem/islem.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (islem)' }, kosullar: {},
  adimlar: [{
    id: 'gonder', sira: 1, baslik: 'Gönder',
    bolumler: [{ id: 'islemler', baslik: 'İşlemler', alanlar: [{ id: 'gonderDugmesi', tip: 'buton', etiket: { ekran: 'Gönder' }, yapilandirma: 'aksiyon', konum: { secici: '#gonder', kirilganlik: 'orta' } }] }],
    kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: SONUC, secici: '#sonuc' }, zamanAsimiSn }
  }],
  senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
});

test.describe('proje hata pencereleri: koşu (127.0.0.1)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  const klasor = mkdtempSync(join(tmpdir(), 'hata-penceresi-'));
  const uygulama = (i: FiksturIstegi): FiksturYaniti => {
    // /hata: Gönder sitenin uyarı kutusunu açar (metin her seferinde farklı olabilir); başarı hiç gelmez.
    if (i.yol === '/hata') {
      return html(`<button type="button" id="gonder">Gönder</button><p id="sonuc"></p><div id="uyari-kutusu" hidden></div>
<script>document.getElementById('gonder').addEventListener('click', () => { const k = document.getElementById('uyari-kutusu'); k.textContent = 'Kayıt bulunamadı (kod ' + Date.now() % 97 + ')'; k.hidden = false; });</script>`);
    }
    // /ikisi: uyarı kutusu sayfada hep görünür (bilgi kutusu gibi) ama Gönder başarıyı da gösterir → akış kazanır.
    if (i.yol === '/ikisi') {
      return html(`<button type="button" id="gonder">Gönder</button><p id="sonuc"></p><div id="uyari-kutusu">Duyuru</div>
<script>document.getElementById('gonder').addEventListener('click', () => { document.getElementById('sonuc').textContent = '${SONUC}'; });</script>`);
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  test.beforeAll(async () => { sunucu = await yerelSunucu(uygulama); tarayici = await korumaliTarayici(); });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); rmSync(klasor, { recursive: true, force: true }); });

  async function kos(testInfo: TestInfo, m: Nesne, pencereler: Array<{ ad: string; secici: string }>): Promise<{ page: Page; hata: string | null; sureMs: number; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {}, hataPencereleri: pencereler },
      tarif: () => { throw new Error('giriş yok'); },
      kimlik: () => ({ kullaniciAdi: 'deneme', parola: 'Sahte-Parola-1', totpGizli: null, sabitKod: null, smsKipi: null }),
      oturumDosyasi: () => join(klasor, 'oturum.json')
    };
    const s: PlatformModelSenaryosu = { id: 's1', baslik: 'İşlem', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'islem', ad: 'İşlem' }, model: m, modelSurumu: 1, altModeller: {}, veri: {}, mutlakaGorunmeli: [] };
    let hata: string | null = null;
    const bas = Date.now();
    try { await modelSenaryosunuKos(page, testInfo, s, ortam); } catch (e) { hata = (e as Error).message; }
    return { page, hata, sureMs: Date.now() - bas, kapat: () => baglam.close() };
  }

  test('proje hata penceresi görünür → adım zaman aşımını beklemeden başarısız; pencerenin metni ve adı iletide', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/hata', 20), [{ ad: 'Uyarı kutusu', secici: '#uyari-kutusu' }]);
    try {
      expect(r.hata).toContain('Kayıt bulunamadı');
      expect(r.hata).toContain('proje hata penceresi: “Uyarı kutusu”');
      expect(r.sureMs).toBeLessThan(15_000);
    } finally { await r.kapat(); }
  });

  test('pencere tanımlı değilse eski davranış: zaman aşımı (kısa süre)', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/hata', 2), []);
    try {
      expect(r.hata).toContain('başarı göstergesi görünmedi');
      expect(r.hata).not.toContain('proje hata penceresi');
    } finally { await r.kapat(); }
  });

  test('öncelik akışın: adımın başarı göstergesi görünüyorsa sayfadaki proje penceresi yok sayılır', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/ikisi', 10), [{ ad: 'Uyarı kutusu', secici: '#uyari-kutusu' }]);
    try {
      expect(r.hata).toBeNull();
      await expect(r.page.locator('#sonuc')).toHaveText(SONUC);
    } finally { await r.kapat(); }
  });
});

test('kayıt: doğrulama, tekrar eden seçici, en çok sayısı; koşuya yalnız açık olanlar görüntüsüz gider', async () => {
  const klasor = mkdtempSync(join(tmpdir(), 'hata-penceresi-vt-'));
  try {
    const vt = await veritabaniniHazirla(join(klasor, 'p.db'));
    await kasaOlustur(vt, `Parola-${randomBytes(4).toString('hex')}-Aa1!`, { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Deneme' });
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const l = hataPencereleriniKaydet(vt, projeId, [
      { ad: 'Uyarı kutusu', secici: '#dialog-content', goruntu: png, etkin: true, fazla: 'atılır' },
      { secici: '.hata-penceresi', etkin: false },
      { ad: 'Bozuk görüntü', secici: '#x', goruntu: 'javascript:alert(1)' }
    ]);
    expect(l.map((p) => [p.ad, p.secici, p.etkin, Boolean(p.goruntu)])).toEqual([
      ['Uyarı kutusu', '#dialog-content', true, true], ['Hata penceresi 2', '.hata-penceresi', false, false], ['Bozuk görüntü', '#x', true, false]
    ]);
    expect(l[0]).not.toHaveProperty('fazla');
    expect(hataPencereleriniOku(vt, projeId).map((p) => p.id)).toEqual(l.map((p) => p.id));
    expect(kosuHataPencereleri(vt, projeId)).toEqual([{ ad: 'Uyarı kutusu', secici: '#dialog-content' }, { ad: 'Bozuk görüntü', secici: '#x' }]);
    expect(() => hataPencereleriniKaydet(vt, projeId, [{ secici: '#a' }, { secici: '#a' }])).toThrow(/iki kez/);
    expect(() => hataPencereleriniKaydet(vt, projeId, [{ secici: '' }])).toThrow(/seçici boş/);
    expect(() => hataPencereleriniKaydet(vt, projeId, Array.from({ length: HATA_PENCERESI_EN_COK + 1 }, (_, i) => ({ secici: `#p${i}` })))).toThrow(/En fazla/);
    expect(() => hataPencereleriniKaydet(vt, 'yok-proje', [])).toThrow(/Proje bulunamadı/);
    vt.kapat();
  } finally { rmSync(klasor, { recursive: true, force: true }); }
});

test('öğe seçme: hata türünde metne bağlı seçici üretilmez (mesaj değişir); görüntü ayıklamada korunur', () => {
  const adaylar = [
    { tur: 'rol', secici: 'role=dialog[name="Kayıt bulunamadı"]', kirilganlik: 'dusuk' },
    { tur: 'metin', secici: 'text=Kayıt bulunamadı', kirilganlik: 'orta' },
    { tur: 'kimlik', secici: '#dialog-content', kirilganlik: 'dusuk' },
    { tur: 'css', secici: 'div.kutu > p', kirilganlik: 'yuksek' }
  ] as Parameters<typeof adaySirasi>[0];
  expect(adaySirasi(adaylar, 'hata').map((a) => a.secici)).toEqual(['#dialog-content', 'div.kutu > p']);
  // Düğmede metne bağlı seçici önce gelir (davranış değişmedi).
  expect(adaySirasi(adaylar, 'dugme')[0].tur).toBe('rol');
  const { ogeler } = secilenOgeleriAyikla([
    { tur: 'hata', secici: '#dialog-content', kirilganlik: 'dusuk', seciciTuru: 'kimlik', metin: null, goruntu: 'data:image/png;base64,iVBORw0KGgo=' },
    { tur: 'hata', secici: '#b', kirilganlik: 'dusuk', seciciTuru: 'kimlik', metin: null, goruntu: 'data:text/html;base64,PGI+' }
  ], ['hata']);
  expect(ogeler[0].goruntu).toBe('data:image/png;base64,iVBORw0KGgo=');
  expect(ogeler[1]).not.toHaveProperty('goruntu');
});

test('beklenen hata adımı: beklenen mesaj gelmeden başka hata (proje hata penceresi) görünürse süre dolmadan biter; beklenen mesaj önce gelir', async () => {
  // Durdurucu ikinci okumada pencere metnini verir (beklenen mesaj hiç gelmez): 20 sn beklenmez.
  let n = 0;
  const bas = Date.now();
  const r = await beklenenMesajiBekle(async () => 'sayfa', ['Limit aşıldı'], { zamanAsimiMs: 20_000, aralikMs: 50, durdur: async () => (++n >= 2 ? 'Mükerrer poliçe — proje hata penceresi' : null) });
  expect(r).toEqual({ sonGorulen: 'Mükerrer poliçe — proje hata penceresi' });
  expect(Date.now() - bas).toBeLessThan(2_000);
  // Beklenen mesaj görünüyorsa durdurucuya bakılmaz.
  const e = await beklenenMesajiBekle(async () => 'Limit aşıldı (kod 3)', ['Limit aşıldı'], { zamanAsimiMs: 1_000, durdur: async () => 'başka hata' });
  expect(e.eslesen).toBe('Limit aşıldı');
});
