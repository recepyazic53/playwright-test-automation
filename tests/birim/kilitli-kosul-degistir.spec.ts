// KORUMA TESTLERİ — KİLİTLİ KOŞULU DEĞİŞTİRME ve "EKRANDA GÖRÜNÜRSE" KARŞILAŞTIRMASI (akış tasarımı, genel koşul düzenleyicisi):
//  - Düzenleyicinin gösteremediği koşul (iç içe ve / veya, bağlam) kilitli görünür ve yanında "Koşulu değiştir" vardır: şu anki koşul
//    üstte salt okunur, "Kaydedince şu anki koşulun yerini alır" uyarısı, altında BOŞ düzenleyici. Kaydedilen koşul eskisinin yerine
//    yazılır (eski adlı koşul bağsız kalmaz); "Koşulu kaldır" alanı her zaman görünür yapar; Vazgeç modeli değiştirmez.
//  - Karşılaştırma listesinde "ekranda görünürse (koşuda belli olur)" → model { calismaZamani: 'gorunurse' }; tek başına ya da VE / VEYA
//    ile. Yalnız bu ifadeyi (ya da tek düzey birleşimini) içeren eski koşullar artık düzenlenebilir açılır.
//  - Değerlendirme: "Bayi = X VE ekranda görünürse" → form: Bayi ≠ X gizli, Bayi = X "koşullu · bilinmiyor"; koşu: Bayi ≠ X atlanır
//    (sayfada görünse de), Bayi = X görünürse doldurulur, görünmüyorsa atlanır (test geçer). 1440 / 390 px taşma yok.
// Fikstür nötrdür (Bayi, Tip, Kod, İndirim, Açıklama, Not; değerler SAHTE). Güvenlik: yalnız 127.0.0.1'deki sahte sayfa; ayrı Nöbetçi
// örneği, geçici veritabanı; dış istek yok.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { ifadeBirlestir, ifadedenSatirlar, kosulAyikla, kosulOzeti, satirIfadesi } from '../../scripts/platform/tarama/gorunurluk-kosulu.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import type { AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { gorunurlukleriHesapla } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const EKRAN_ANAHTAR = 'kilitli-kosul';
const EKRAN_AD = 'Kilitli koşul ekranı';
const GORUNURSE = 'ekranda görünürse (koşuda belli olur)';
const IC_ICE_INDIRIM = { ve: [{ calismaZamani: 'gorunurse' }, { veya: [{ alan: 'tip', esit: 'A' }, { alan: 'bayi', dolu: false }] }] };
const IC_ICE_NOT = { veya: [{ ve: [{ alan: 'tip', esit: 'A' }, { alan: 'bayi', esit: 'X' }] }, { calismaZamani: 'gorunurse' }] };
const YENI_INDIRIM = { ve: [{ alan: 'bayi', esit: 'X' }, { calismaZamani: 'gorunurse' }] };

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'dusuk' }, zorunlu: false, ...ek
});
const radyo = (id: string, etiket: string, degerler: string[]): Nesne => alan(id, 'radyo', etiket, {
  konum: { secici: `input[name="${id}"]`, kirilganlik: 'dusuk' }, secenekler: degerler.map((d) => ({ deger: d, metin: `${etiket} ${d}` })), seceneklerDurumu: 'tam'
});

/**
 * Ekran: Bayi (X / Y) · Tip (A / B) · Kod (yalnız "ekranda görünürse": artık düzenlenebilir) · İndirim (iç içe: kilitli) ·
 * Açıklama (bağlam: kilitli) · Not (iç içe: kilitli).
 */
function ekranModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: EKRAN_ANAHTAR, ad: EKRAN_AD, aciklama: 'Kilitli koşul fikstürü (değerler sahte).', ekranUrl: '/kilitli-formu/', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' },
    kosullar: {
      kodCalisma: { aciklama: 'koşuda görünüyorsa doldurulur', ifade: { calismaZamani: 'gorunurse' } },
      indirimIcIce: { aciklama: 'koşuda görünüyorsa doldurulur (iç içe)', ifade: IC_ICE_INDIRIM },
      notIcIce: { aciklama: 'Tip A ve Bayi X ya da koşuda görünüyorsa', ifade: IC_ICE_NOT }
    },
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Bilgiler girilir',
      bolumler: [{ id: 'bilgiBolumu', baslik: 'Bilgiler', alanlar: [
        radyo('bayi', 'Bayi', ['X', 'Y']),
        radyo('tip', 'Tip', ['A', 'B']),
        alan('kod', 'metin', 'Kod', { gorunurluk: { kosul: 'kodCalisma' } }),
        alan('indirim', 'metin', 'İndirim', { gorunurluk: { kosul: 'indirimIcIce' } }),
        alan('aciklama', 'metin', 'Açıklama', { gorunurluk: { ifade: { baglam: { alanSeti: 'A' } } } }),
        alan('not', 'metin', 'Not', { gorunurluk: { kosul: 'notIcIce' } }),
        { id: 'kaydetDugmesi', tip: 'buton', yapilandirma: 'cikti', etiket: { ekran: 'Kaydet' }, konum: { secici: '#kaydet', kirilganlik: 'dusuk' } }
      ] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Sahte sayfa: İndirim yalnız Tip A iken görünür (Bayi'den bağımsız: koşulu sağlanmayan alanın sayfada görünse de atlandığını sınar). */
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kilitli koşul formu</title></head><body>
<form onsubmit="return false">
<fieldset><legend>Bayi</legend><label><input type="radio" name="bayi" value="X"> Bayi X</label> <label><input type="radio" name="bayi" value="Y"> Bayi Y</label></fieldset>
<fieldset><legend>Tip</legend><label><input type="radio" name="tip" value="A"> Tip A</label> <label><input type="radio" name="tip" value="B"> Tip B</label></fieldset>
<p><label for="kod">Kod</label> <input id="kod"></p>
<p id="indirimSatiri" hidden><label for="indirim">İndirim</label> <input id="indirim"></p>
<p><label for="aciklama">Açıklama</label> <input id="aciklama"></p>
<p><label for="not">Not</label> <input id="not"></p>
<button id="kaydet" type="button">Kaydet</button><p id="sonuc"></p>
</form>
<script>
const $ = (id) => document.getElementById(id);
const sec = (ad) => (document.querySelector('input[name="' + ad + '"]:checked') || {}).value || '';
document.addEventListener('change', () => { $('indirimSatiri').hidden = sec('tip') !== 'A'; });
$('kaydet').addEventListener('click', async () => {
  await fetch('/kilitli-formu/kaydet', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bayi: sec('bayi'), tip: sec('tip'), indirim: $('indirim').value }) });
  $('sonuc').textContent = 'Kaydedildi';
});
</script></body></html>`;

// ---- Saf işlevler ---------------------------------------------------------------------------------------------------

const META = { ekranAnahtari: EKRAN_ANAHTAR, ekranAdi: EKRAN_AD, urlYolu: '/kilitli-formu/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const alanlarHaritasi = (m: Nesne): Record<string, Nesne> => Object.fromEntries((m.adimlar as Nesne[]).flatMap((a) => ((a.bolumler ?? []) as Nesne[]).flatMap((b) => (b.alanlar as Nesne[]).map((x) => [x.id, x]))));
const ifadesi = (m: Nesne, id: string): unknown => {
  const g = alanlarHaritasi(m)[id].gorunurluk;
  return !g ? null : g.kosul ? m.kosullar[g.kosul].ifade : g.ifade;
};
const grubu = (m: Nesne): Nesne => adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m)).find((b) => b.tur === 'alanlar') as Nesne;
/** Diyagram (alan grubunun koşulları değiştirilerek) → model (akisKaydet ile aynı çeviri). */
function diyagramdanModel(m: Nesne, kosullar: Record<string, unknown>): { model: Nesne | null; hatalar: string[] } {
  const env = modeldenAkisEnvanteri(m);
  const bloklar = adimlardanBloklar(m, m.adimlar, env).map((b) => (b.tur === 'alanlar' ? { ...b, kosullar: { ...(b.kosullar ?? {}), ...kosullar } } : b)) as AkisBlogu[];
  const { envanter, hatalar } = akistanKayitEnvanteri(env, bloklar);
  if (!envanter) return { model: null, hatalar: hatalar.map((h) => h.mesaj) };
  return { model: kayitPaketiOlustur({ ...META, mevcutModel: m }, envanter).paket.model as Nesne, hatalar: [] };
}
const GORUNURSE_SATIRI = { alan: '', islem: 'gorunurse', degerler: [] };
const BAYI_VE_GORUNURSE = { bag: 've', satirlar: [{ alan: 'bayi', islem: 'esit', degerler: ['X'] }, GORUNURSE_SATIRI] };

test.describe('saf işlevler', () => {
  test('"ekranda görünürse": satır ↔ model ifadesi, tek başına ve VE / VEYA ile; ayıklama; özet; en çok bir kez', () => {
    expect(satirIfadesi({ islem: 'gorunurse', degerler: [] }, '', false)).toEqual({ calismaZamani: 'gorunurse' });
    expect(ifadedenSatirlar({ calismaZamani: 'gorunurse' })).toEqual({ bag: 've', satirlar: [GORUNURSE_SATIRI] });
    expect(ifadedenSatirlar(YENI_INDIRIM)).toEqual(BAYI_VE_GORUNURSE);
    expect(ifadedenSatirlar({ veya: [{ alan: 'tip', esit: 'A' }, { calismaZamani: 'gorunurse' }] }))
      .toEqual({ bag: 'veya', satirlar: [{ alan: 'tip', islem: 'esit', degerler: ['A'] }, GORUNURSE_SATIRI] });
    expect(ifadeBirlestir('ve', [satirIfadesi({ islem: 'esit', degerler: ['X'] }, 'bayi', false), satirIfadesi({ islem: 'gorunurse', degerler: [] }, '', false)])).toEqual(YENI_INDIRIM);
    // Gerçekten gösterilemeyenler: iç içe karışık, bağlam, iki kez "görünürse".
    expect(ifadedenSatirlar(IC_ICE_INDIRIM)).toBeNull();
    expect(ifadedenSatirlar(IC_ICE_NOT)).toBeNull();
    expect(ifadedenSatirlar({ baglam: { alanSeti: 'A' } })).toBeNull();
    expect(ifadedenSatirlar({ ve: [{ calismaZamani: 'gorunurse' }, { calismaZamani: 'gorunurse' }] })).toBeNull();
    // Ayıklama: "görünürse" satırının alanı / değeri / genel senaryo işareti atılır.
    expect(kosulAyikla({ bag: 've', satirlar: [{ alan: 'x', islem: 'gorunurse', degerler: ['1'], ortak: true }] })).toEqual({ bag: 've', satirlar: [GORUNURSE_SATIRI] });
    const ad = (s: { alan: string }) => (s.alan === 'bayi' ? 'Bayi' : s.alan);
    expect(kosulOzeti(BAYI_VE_GORUNURSE, ad)).toBe('Bayi = X ve ekranda görünüyor ise');
    expect(kosulOzeti({ bag: 've', satirlar: [GORUNURSE_SATIRI] }, ad)).toBe('ekranda görünüyor ise');
  });

  test('diyagram: yalnız "görünürse" koşulu düzenlenebilir açılır; iç içe / bağlam kilitli; değiştir → yenisi yazılır, kaldır → koşulsuz; doğrulama', () => {
    const m = ekranModel();
    const g = grubu(m);
    expect(g.kosullar.kod).toEqual({ bag: 've', satirlar: [GORUNURSE_SATIRI] });
    expect(g.korunanKosullar).toEqual({ indirim: 'koşuda görünüyorsa doldurulur (iç içe)', aciklama: 'bağlam: A', not: 'Tip A ve Bayi X ya da koşuda görünüyorsa' });
    // Değiştirmeden gidiş-dönüş: hepsi aynen (Kod aynı adlı koşulla).
    const ayni = diyagramdanModel(m, {}).model as Nesne;
    for (const id of ['kod', 'indirim', 'aciklama', 'not']) expect(alanlarHaritasi(ayni)[id].gorunurluk, id).toEqual(alanlarHaritasi(m)[id].gorunurluk);
    // Kilitli İndirim → "Bayi = X VE ekranda görünürse"; kilitli Açıklama → kaldır; Not (Vazgeç) aynen.
    const { model, hatalar } = diyagramdanModel(m, { indirim: BAYI_VE_GORUNURSE, aciklama: null });
    expect(hatalar).toEqual([]);
    const yeni = model as Nesne;
    expect(ifadesi(yeni, 'indirim')).toEqual(YENI_INDIRIM);
    expect(JSON.stringify(alanlarHaritasi(yeni).indirim)).not.toContain('veya');
    expect(yeni.kosullar[alanlarHaritasi(yeni).indirim.gorunurluk.kosul].aciklama).toBe('Bayi = Bayi X ve ekranda görünüyor ise doldurulur (akış tasarımı).');
    expect(alanlarHaritasi(yeni).aciklama.gorunurluk).toBeUndefined();
    expect(alanlarHaritasi(yeni).not.gorunurluk).toEqual({ kosul: 'notIcIce' });
    expect(() => ekranModeliniDogrula('kilitli-kosul.model.json', yeni, () => { throw new Error('alt model yok'); })).not.toThrow();
    // Geri okuma: değişen alan artık düzenlenebilir.
    const geri = grubu(yeni);
    expect(geri.kosullar.indirim).toEqual(BAYI_VE_GORUNURSE);
    expect(geri.korunanKosullar).toEqual({ not: 'Tip A ve Bayi X ya da koşuda görünüyorsa' });
    // İki kez "görünürse" reddedilir.
    expect(diyagramdanModel(m, { indirim: { bag: 'veya', satirlar: [GORUNURSE_SATIRI, GORUNURSE_SATIRI] } }).hatalar)
      .toEqual(['“İndirim” alanının koşulunda “ekranda görünürse” yalnız bir kez olabilir.']);
  });

  test('değerlendirme: "Bayi = X VE ekranda görünürse" — form gizli / bilinmiyor; koşu planı atlanır / görünürse doldurulur', () => {
    const yeni = diyagramdanModel(ekranModel(), { indirim: BAYI_VE_GORUNURSE, aciklama: null }).model as Nesne;
    const g = (veri: Nesne) => gorunurlukleriHesapla(veri, { model: yeni as Nesne & { adimlar: Nesne[] } }).alanlar;
    expect(g({ bayi: 'Y', tip: 'A' }).indirim).toBe(false);
    expect(g({ bayi: 'X', tip: 'A' }).indirim).toBeNull();
    expect(g({ tip: 'A' }).indirim).toBe(false); // Bayi boş (ekranın kendi alanı): ≠ X
    expect(g({ bayi: 'Y' }).kod).toBeNull(); // yalnız "görünürse": her zaman bilinmiyor
    const planAlani = (veri: Nesne) => modelKosuPlani(yeni, { baslik: 'x', ...veri }).adimlar.flatMap((a) => a.alanlar).find((x) => x.id === 'indirim');
    expect(planAlani({ bayi: 'Y', tip: 'A', indirim: '5' })).toBeUndefined();
    expect(planAlani({ bayi: 'X', tip: 'A', indirim: '5' })).toMatchObject({ deger: '5', mutlakaGorunmeli: false });
    // "Mutlaka görünmeli" olsa da koşul bilinmiyorken uygulanmaz (görünürse doldurulur).
    alanlarHaritasi(yeni).indirim.mutlakaGorunmeli = true;
    expect(planAlani({ bayi: 'X', tip: 'A', indirim: '5' })).toMatchObject({ deger: '5', mutlakaGorunmeli: false });
  });
});

// ---- Sunucu, arayüz ve koşu ------------------------------------------------------------------------------------------

test.describe('sunucu, arayüz ve koşu (sahte sayfa)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kilitli-Kosul-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const gelenler: Nesne[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const model = async () => (await api(`/platform/ekran?projeId=${projeId}&id=${encodeURIComponent(ekranId)}`)).model as Nesne;
  const tasmaYok = async (page: Page, yer: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), yer).toBeLessThanOrEqual(0);
  const kutuTasmaz = async (l: Locator, yer: string) => expect(await l.evaluate((e) => e.scrollWidth - e.clientWidth), yer).toBeLessThanOrEqual(1);

  async function sayfaAc(adres: string, genislik: number): Promise<{ page: Page; bitir: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    const istekler: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    baglam.on('request', (r) => { istekler.push(r.url()); });
    await page.goto(adres);
    return {
      page,
      bitir: async () => {
        expect(hatalar).toEqual([]);
        expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
        await baglam.close();
      }
    };
  }
  async function tasarimAc(genislik: number) {
    const s = await sayfaAc(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`, genislik);
    await s.page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(s.page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    return s;
  }
  const cip = (page: Page, etiket: string) => page.locator('.tasarim-alani').filter({ has: page.locator('.ad', { hasText: new RegExp(`^${etiket}$`) }) });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kilitli-kosul-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/kilitli-formu/') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/kilitli-formu/kaydet' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Nesne); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Kilitli Koşul Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', {
      projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId],
      paket: {
        tur: 'sayfa-paketi', surum: 1,
        meta: { ekran: { anahtar: EKRAN_ANAHTAR, ad: EKRAN_AD, urlYolu: '/kilitli-formu/' }, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
        model: ekranModel(), senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
      }
    });
    ekranId = String(((await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[]).find((e) => e.anahtar === EKRAN_ANAHTAR)?.id);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('akış tasarımı (1440 px): "görünürse" koşulu düzenlenebilir; kilitli koşulda "Koşulu değiştir" — şu anki + uyarı, Vazgeç, kaldır, Bayi = X VE görünürse → model', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await tasarimAc(1440);
    // Kod: yalnız "ekranda görünürse" → kilitli değil; özet + "Koşulu düzenle"; satır "görünürse", alan seçimi kapalı.
    const kod = cip(page, 'Kod');
    await expect(kod.locator('.kosul-ozeti')).toHaveText('ekranda görünüyor ise doldurulur');
    await expect(kod.getByRole('note')).toHaveCount(0);
    await kod.getByRole('button', { name: 'Kod: koşul' }).click();
    const kodDuz = page.getByRole('group', { name: 'Kod: ne zaman görünür' });
    await expect(kodDuz.getByRole('combobox', { name: 'Karşılaştırma' })).toHaveValue('gorunurse');
    await expect(kodDuz.getByRole('combobox', { name: 'Alan' })).toBeDisabled();
    await expect(kodDuz.getByText('Şu anki:', { exact: false })).toHaveCount(0);
    await kodDuz.getByRole('button', { name: 'Vazgeç' }).click();

    // İndirim (iç içe): kilitli not + "Koşulu değiştir".
    const indirim = cip(page, 'İndirim');
    await expect(indirim.getByRole('note', { name: 'İndirim: koşul (diyagramda düzenlenemez)' })).toHaveText('koşuda görünüyorsa doldurulur (iç içe)');
    const degistir = indirim.getByRole('button', { name: 'İndirim: koşul' });
    await expect(degistir).toHaveText('Koşulu değiştir');
    await degistir.click();
    const duz = page.getByRole('group', { name: 'İndirim: ne zaman görünür' });
    await expect(duz.getByText('Şu anki: koşuda görünüyorsa doldurulur (iç içe)')).toBeVisible();
    await expect(duz.getByRole('note', { name: 'Uyarı' })).toContainText('Kaydedince şu anki koşulun yerini alır');
    // Düzenleyici boş başlar.
    const s1 = duz.getByRole('group', { name: 'Koşul 1' });
    await expect(s1.getByRole('combobox', { name: 'Alan' })).toHaveValue('');
    expect(await s1.getByRole('combobox', { name: 'Karşılaştırma' }).locator('option').allTextContents()).toEqual(['= (şunlardan biri)', '≠ (hiçbiri)', 'dolu', 'boş', GORUNURSE]);
    await expect(duz.getByRole('button', { name: 'Koşulu kaldır' })).toBeVisible();
    // Vazgeç: kilitli kalır.
    await s1.getByRole('combobox', { name: 'Alan' }).selectOption({ label: 'Tip' });
    await duz.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(duz).toHaveCount(0);
    await expect(indirim.getByRole('note', { name: 'İndirim: koşul (diyagramda düzenlenemez)' })).toBeVisible();

    // Not (iç içe): açılıp değiştirilir, sonra Vazgeç → kaydedince model aynen.
    const not = cip(page, 'Not');
    await not.getByRole('button', { name: 'Not: koşul' }).click();
    const notDuz = page.getByRole('group', { name: 'Not: ne zaman görünür' });
    await notDuz.getByRole('group', { name: 'Koşul 1' }).getByRole('combobox', { name: 'Karşılaştırma' }).selectOption('gorunurse');
    await notDuz.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(not.getByRole('note', { name: 'Not: koşul (diyagramda düzenlenemez)' })).toBeVisible();

    // Açıklama (bağlam): Koşulu kaldır → her zaman görünür.
    const aciklama = cip(page, 'Açıklama');
    await aciklama.getByRole('button', { name: 'Açıklama: koşul' }).click();
    await page.getByRole('group', { name: 'Açıklama: ne zaman görünür' }).getByRole('button', { name: 'Koşulu kaldır' }).click();
    await expect(aciklama.getByRole('note')).toHaveCount(0);
    await expect(aciklama.getByRole('button', { name: 'Açıklama: koşul' })).toHaveText('Koşul ekle');

    // İndirim: Bayi = X VE ekranda görünürse.
    await degistir.click();
    const s1b = duz.getByRole('group', { name: 'Koşul 1' });
    await s1b.getByRole('combobox', { name: 'Alan' }).selectOption({ label: 'Bayi' });
    await s1b.getByRole('checkbox', { name: 'Bayi X' }).check();
    await duz.getByRole('button', { name: '+ VE koşul' }).click();
    const s2 = duz.getByRole('group', { name: 'Koşul 2' });
    await s2.getByRole('combobox', { name: 'Karşılaştırma' }).selectOption('gorunurse');
    await expect(s2.getByRole('combobox', { name: 'Alan' })).toBeDisabled();
    await expect(s2.getByRole('group', { name: 'Değerler' })).toContainText('ekranda görünüyorsa doldurulur');
    await tasmaYok(page, 'değiştir 1440');
    await kutuTasmaz(duz, 'değiştir kutusu 1440');
    await duz.screenshot({ path: test.info().outputPath('kilitli-degistir-1440.png') });
    await duz.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(indirim.locator('.kosul-ozeti')).toHaveText('Bayi = Bayi X ve ekranda görünüyor ise doldurulur');
    await expect(indirim.getByRole('note')).toHaveCount(0);
    await expect(indirim.getByRole('button', { name: 'İndirim: koşul' })).toHaveText('Koşulu düzenle');
    await tasmaYok(page, 'özet 1440');

    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText(/Akış kaydedildi/).first()).toBeVisible();
    const m = await model();
    expect(ifadesi(m, 'indirim')).toEqual(YENI_INDIRIM);
    // Eski koşul yok: alan ona başvurmaz ve (başka yerde kullanılmadığı için) koşul modelden çıkar.
    expect(m.kosullar).not.toHaveProperty('indirimIcIce');
    expect(alanlarHaritasi(m).aciklama.gorunurluk).toBeUndefined();
    // Değiştirilmeyenler aynen.
    expect(alanlarHaritasi(m).kod.gorunurluk).toEqual({ kosul: 'kodCalisma' });
    expect(alanlarHaritasi(m).not.gorunurluk).toEqual({ kosul: 'notIcIce' });
    expect(m.kosullar.notIcIce.ifade).toEqual(IC_ICE_NOT);
    await bitir();
  });

  test('akış tasarımı (390 px): kilitli koşul değiştirilirken taşma yok; "ekranda görünürse" tek başına', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await tasarimAc(390);
    const not = cip(page, 'Not');
    await not.getByRole('button', { name: 'Not: koşul' }).click();
    const duz = page.getByRole('group', { name: 'Not: ne zaman görünür' });
    await expect(duz.getByText('Şu anki: Tip A ve Bayi X ya da koşuda görünüyorsa')).toBeVisible();
    await expect(duz.getByRole('note', { name: 'Uyarı' })).toBeVisible();
    await duz.getByRole('group', { name: 'Koşul 1' }).getByRole('combobox', { name: 'Karşılaştırma' }).selectOption('gorunurse');
    await tasmaYok(page, 'değiştir 390');
    await kutuTasmaz(duz, 'değiştir kutusu 390');
    await duz.screenshot({ path: test.info().outputPath('kilitli-degistir-390.png') });
    await duz.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(not.locator('.kosul-ozeti')).toHaveText('ekranda görünüyor ise doldurulur');
    await expect(not.getByRole('note')).toHaveCount(0);
    await tasmaYok(page, 'özet 390');
    await bitir();
  });

  test('senaryo formu: Bayi ≠ X → İndirim gizli; Bayi = X → görünür, "koşullu · bilinmiyor"', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await sayfaAc(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`, 1440);
    const alanKap = (id: string): Locator => page.locator(`[data-alan="${id}"]`);
    await expect(alanKap('bayi')).toBeVisible({ timeout: 20_000 });
    await alanKap('bayi').getByRole('radio', { name: 'Bayi Y', exact: true }).check();
    await expect(alanKap('indirim')).toBeHidden();
    await alanKap('bayi').getByRole('radio', { name: 'Bayi X', exact: true }).check();
    await expect(alanKap('indirim')).toBeVisible();
    await expect(alanKap('indirim').locator('.kosullu-cip')).toHaveText('koşullu · bilinmiyor');
    await tasmaYok(page, 'form 1440');
    await bitir();
  });

  test('koşu: Bayi ≠ X → İndirim atlanır (sayfada görünse de); Bayi = X → görünürse doldurulur, görünmüyorsa atlanır', async () => {
    test.setTimeout(300_000);
    const kos = async (baslik: string, veri: Nesne): Promise<Nesne> => {
      const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
      const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
      expect(y.basarili, `${baslik}: ${String(y.mesaj ?? '')}`).toBe(true);
      return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    };
    let once = gelenler.length;
    const atla = await kos('Koşu Y', { bayi: 'Y', tip: 'A', indirim: '5' });
    expect(atla.durum, JSON.stringify(atla.hataMesaji)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ bayi: 'Y', tip: 'A', indirim: '' }]);
    once = gelenler.length;
    const doldur = await kos('Koşu X', { bayi: 'X', tip: 'A', indirim: '5' });
    expect(doldur.durum, JSON.stringify(doldur.hataMesaji)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ bayi: 'X', tip: 'A', indirim: '5' }]);
    once = gelenler.length;
    const gizli = await kos('Koşu X gizli', { bayi: 'X', tip: 'B', indirim: '5' });
    expect(gizli.durum, JSON.stringify(gizli.hataMesaji)).toBe('basarili');
    expect(JSON.stringify(gizli)).toContain('ekranda görünmüyor');
    expect(gelenler.slice(once)).toEqual([{ bayi: 'X', tip: 'B', indirim: '' }]);
  });
});
