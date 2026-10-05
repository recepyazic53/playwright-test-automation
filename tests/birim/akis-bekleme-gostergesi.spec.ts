// KORUMA TESTLERİ — AKIŞTA "SONRA BEKLER" (düğmeden sonra ne beklenir): ekran modelinde ilerleme düğmesinin kosu.basariGostergesi +
// zamanAsimiSn'i akış görünümünde ve tasarımında okunur bir satırdır ("Sonra bekler: İl alanı görünür · zaman aşımı 3 sn"); tasarımda
// "Değiştir" ile (a) ekrandaki bir alan / düğme (seçici modelden; koşullu alan seçilince "yalnız ‹koşul› görünür … zaman aşımına
// düşer" uyarısı), (b) bir yazı (isteğe bağlı kap seçicisi), (c) sayfada seç ve (d) zaman aşımı seçilir; kayıt akış tasarımının
// kaydetme yoluyla yeni model sürümü olur (varsayılan akışın adımları modelle aynı). Genel senaryonun adımı ekranda salt okunur,
// kendi sayfasında düzenlenir. Gerçek vaka: sorgu düğmesinden sonra yalnız A dalında açılan kutu beklenir → B dalı zaman aşımına
// düşer; her iki dalda görünen alan seçilince B dalı geçer. 1440 / 390 px taşma yok.
// Fikstür nötrdür (Tip A/B, İl, Not; değerler SAHTE). Güvenlik: yalnız 127.0.0.1'deki sahte sayfa; ayrı Nöbetçi örneği, geçici
// veritabanı; dış istek yok.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import type { AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, sabitGostergeMetni } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { akisDiyagrami, gostergeOkunusu, gostergeSabitMetni, sayfadanGosterge, seciciAdlari, sonraBeklerMetni } from '../../scripts/platform/senaryolar/akis-diyagrami.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const EKRAN_ANAHTAR = 'sorgu-ekrani';
const EKRAN_AD = 'Sorgu ekranı';
const ORTAK_ANAHTAR = 'ortak-onay';
const ORTAK_DOSYA = `${ORTAK_ANAHTAR}.model.json`;
const ORTAK_AD = 'Ortak onay';
const IKINCI_ANAHTAR = 'ozet-ekrani';
const IKINCI_AD = 'Özet ekranı';
const ILK_SATIR = 'Sonra bekler: Ek bilgi alanı görünür · zaman aşımı 3 sn';

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'dusuk' }, zorunlu: false, ...ek
});
const cikti = (id: string, etiket: string, secici: string, tip = 'cikti'): Nesne => ({ id, tip, yapilandirma: 'cikti', etiket: { ekran: etiket }, konum: { secici, kirilganlik: 'dusuk' } });

/**
 * Ekran: 1) Tip (radyo) + "Sorgula" → başarı göstergesi YALNIZ A dalında açılan "Ek bilgi" kutusu (gerçek vaka; zaman aşımı 3 sn);
 * 2) İl (her dalda) + Not (yalnız Tip = A) + "Kaydet" → "Kaydedildi".
 */
function ekranModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: EKRAN_ANAHTAR, ad: EKRAN_AD, aciklama: 'Sonra bekler fikstürü (değerler sahte).', ekranUrl: '/sorgu-formu/', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' },
    kosullar: { notGorunur: { aciklama: 'Tip = A seçilince görünür.', ifade: { alan: 'tip', esit: 'A' } } },
    adimlar: [
      {
        id: 'sorgu', sira: 1, baslik: 'Sorgu yapılır',
        bolumler: [{ id: 'sorguBolumu', baslik: 'Sorgu', alanlar: [
          alan('tip', 'radyo', 'Tip', { konum: { secici: 'input[name="tip"]', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'A', metin: 'Tip A' }, { deger: 'B', metin: 'Tip B' }], seceneklerDurumu: 'tam' }),
          cikti('ekBilgi', 'Ek bilgi', '#kutuA'),
          cikti('sorgulaDugmesi', 'Sorgula', '#sorgula', 'buton')
        ] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#sorgula', aciklama: 'Sorgula' }], basariGostergesi: { tur: 'eleman', deger: '#kutuA' }, zamanAsimiSn: 3 }
      },
      {
        id: 'kayit', sira: 2, baslik: 'Kayıt yapılır',
        bolumler: [{ id: 'kayitBolumu', baslik: 'Kayıt', alanlar: [
          alan('il', 'metin', 'İl'),
          alan('not', 'metin', 'Not', { gorunurluk: { kosul: 'notGorunur' } }),
          cikti('kaydetDugmesi', 'Kaydet', '#kaydet', 'buton')
        ] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Genel senaryo: Kod + "Onayla" → "Onaylandı" (yalnız arayüz denetimi; koşulmaz). */
function ortakModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: ORTAK_AD, aciklama: 'Genel senaryo (nötr fikstür).', kosullar: {},
    adimlar: [{
      id: 'onayAdimi', sira: 1, baslik: 'Onay verilir',
      bolumler: [{ id: 'onayBolumu', baslik: 'Onay', alanlar: [alan('kod', 'metin', 'Kod'), cikti('onaylaDugmesi', 'Onayla', '#onayla', 'buton')] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }], basariGostergesi: { tur: 'metin', deger: 'Onaylandı' } }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** İkinci ekran: önce genel senaryo, sonra tek alan (genel senaryonun adımı burada salt okunur). */
function ikinciModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: IKINCI_ANAHTAR, ad: IKINCI_AD, aciklama: 'Genel senaryolu ekran (nötr).', ekranUrl: '/sorgu-formu/', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [
      { id: 'ortakAdim', sira: 1, baslik: ORTAK_AD, ortakAkis: { dosya: ORTAK_DOSYA } },
      { id: 'ozet', sira: 2, baslik: 'Özet girilir', bolumler: [{ id: 'ozetBolumu', baslik: 'Özet', alanlar: [alan('il', 'metin', 'İl')] }] }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Sahte sayfa: "Sorgula"dan sonra İl her dalda, "Ek bilgi" kutusu ve Not yalnız Tip A'da görünür. */
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Sorgu formu</title></head><body>
<form onsubmit="return false">
<fieldset><legend>Tip</legend><label><input type="radio" name="tip" value="A"> Tip A</label> <label><input type="radio" name="tip" value="B"> Tip B</label></fieldset>
<button id="sorgula" type="button">Sorgula</button>
<div id="kutuA" hidden>Ek bilgi: A dalı</div>
<p id="ilSatiri" hidden><label for="il">İl</label> <input id="il"></p>
<p id="notSatiri" hidden><label for="not">Not</label> <input id="not"></p>
<button id="kaydet" type="button" hidden>Kaydet</button><p id="sonuc"></p>
</form>
<script>
const $ = (id) => document.getElementById(id);
const tip = () => (document.querySelector('input[name="tip"]:checked') || {}).value || '';
$('sorgula').addEventListener('click', () => setTimeout(() => {
  $('ilSatiri').hidden = false; $('kaydet').hidden = false;
  $('kutuA').hidden = tip() !== 'A'; $('notSatiri').hidden = tip() !== 'A';
}, 150));
$('kaydet').addEventListener('click', async () => {
  await fetch('/sorgu-formu/kaydet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tip: tip(), il: $('il').value, not: $('not').value }) });
  $('sonuc').textContent = 'Kaydedildi';
});
</script></body></html>`;

// ---- Saf işlevler ---------------------------------------------------------------------------------------------------

const META = { ekranAnahtari: EKRAN_ANAHTAR, ekranAdi: EKRAN_AD, urlYolu: '/sorgu-formu/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const adimKosusu = (m: Nesne, id: string): Nesne => (m.adimlar as Nesne[]).find((a) => a.id === id)?.kosu ?? {};
/** Diyagram blokları (değiştir() ile) → model (akisKaydet ile aynı çeviri). */
function diyagramdanModel(m: Nesne, degistir: (b: Nesne[]) => Nesne[]): { model: Nesne | null; hatalar: string[] } {
  const env = modeldenAkisEnvanteri(m);
  const ayik = bloklariAyikla(degistir(adimlardanBloklar(m, m.adimlar, env) as Nesne[]));
  if (ayik.hatalar.length) return { model: null, hatalar: ayik.hatalar.map((h) => h.mesaj) };
  const { envanter, hatalar } = akistanKayitEnvanteri(env, ayik.bloklar as AkisBlogu[]);
  if (!envanter) return { model: null, hatalar: hatalar.map((h) => h.mesaj) };
  return { model: kayitPaketiOlustur({ ...META, mevcutModel: m }, envanter).paket.model as Nesne, hatalar: [] };
}
const sorgula = (b: Nesne[]): Nesne => b.find((x) => x.tur === 'aksiyon' && !x.gorunurse && b.indexOf(x) < b.findIndex((y) => y.tur === 'alanlar' && y.alanlar.includes('il'))) as Nesne;

test.describe('saf işlevler', () => {
  test('okunuş: alan / düğme etiketi, yazı, kalıp, veya; gösterge yoksa koşucunun davranışı; zaman aşımı yoksa Ayarlar', () => {
    const m = ekranModel();
    const adlar = seciciAdlari(m);
    expect(gostergeOkunusu({ tur: 'eleman', deger: '#il' }, adlar)).toBe('İl alanı görünür');
    expect(gostergeOkunusu({ tur: 'eleman', deger: '#kaydet' }, adlar)).toBe('“Kaydet” düğmesi görünür');
    expect(gostergeOkunusu({ tur: 'eleman', deger: '#yok' }, adlar)).toBe('“#yok” öğesi görünür');
    expect(gostergeOkunusu({ tur: 'metin', deger: 'Kaydedildi', secici: '#il' }, adlar)).toBe('“Kaydedildi” yazısı görünür (İl içinde)');
    expect(gostergeOkunusu({ tur: 'desen', deger: '[1-9]', secici: '#il' }, adlar)).toBe('İl yazısı sıfırdan farklı bir rakam içerir');
    expect(gostergeOkunusu({ tur: 'desen', deger: 'A-[0-9]{3}' }, adlar)).toBe('Sayfanın yazısı şu kalıba uyar: A-[0-9]{3}');
    expect(gostergeOkunusu({ tur: 'veya', secenekler: [{ tur: 'eleman', deger: '#il' }, { tur: 'metin', deger: 'Tamam' }] }, adlar)).toBe('İl alanı görünür ya da “Tamam” yazısı görünür');
    expect(sonraBeklerMetni(null, undefined)).toBe('Sonra bekler: belirtilmemiş (düğmeden sonra beklemeden sonraki adıma geçer)');
    expect(sonraBeklerMetni('İl alanı görünür', undefined)).toBe('Sonra bekler: İl alanı görünür · zaman aşımı: Ayarlar’daki adım süresi');
    // Akış görünümü: düğmeli her adımda satır.
    const d = akisDiyagrami(m);
    expect(d.adimlar.map((a) => a.sonraBekler)).toEqual([ILK_SATIR, 'Sonra bekler: “Kaydedildi” yazısı görünür · zaman aşımı: Ayarlar’daki adım süresi']);
    // Sayfada seçilen öğe: sabit yazı varsa yazı (öğede), yoksa öğe görünür — paket oluşturucunun kuralıyla aynı.
    for (const x of ['Kayıt bulundu: 12345', 'No: SP-1003', '12.05.2026', 'Tamam', 'ab', '', 'Sonuç (3 kayıt)']) expect(gostergeSabitMetni(x)).toBe(sabitGostergeMetni(x));
    expect(sayfadanGosterge({ secici: '#s', metin: 'Kayıt bulundu: 12345' })).toEqual({ tur: 'metin', deger: 'Kayıt bulundu', secici: '#s' });
    expect(sayfadanGosterge({ secici: '#s', metin: '42', cerceve: ['#c'] })).toEqual({ tur: 'eleman', deger: '#s', cerceve: ['#c'] });
  });

  test('modelden bloklar: kendiliğinden kurulamayan ara gösterge seçim olarak gelir ve aynen korunur; Değiştir → model; yanlış birlikte kullanım reddedilir', () => {
    const m = ekranModel();
    const bloklar = adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m)) as Nesne[];
    const s = sorgula(bloklar);
    expect(s).toMatchObject({ zamanAsimiSn: 3, gosterge: { tur: 'oge', secici: '#kutuA' }, beklenenOkunus: 'Ek bilgi alanı görünür' });
    // Son adımın yazı göstergesi mesaj bloğudur (okunuş blokta yok).
    const kaydet = bloklar.filter((x) => x.tur === 'aksiyon').at(-1) as Nesne;
    expect(kaydet).not.toHaveProperty('beklenenOkunus');
    expect(bloklar.some((x) => x.tur === 'mesaj' && x.metin === 'Kaydedildi')).toBe(true);

    // Dokunmadan kaydet: ara gösterge (#kutuA) kendiliğinden kurulanla (#il) değişmez.
    const ayni = diyagramdanModel(m, (b) => b);
    expect(ayni.hatalar).toEqual([]);
    expect(adimKosusu(ayni.model as Nesne, 'sorgu')).toMatchObject({ basariGostergesi: { tur: 'eleman', deger: '#kutuA' }, zamanAsimiSn: 3 });

    // Değiştir: her dalda görünen İl + zaman aşımı 5 → modelde eleman #il.
    const il = diyagramdanModel(m, (b) => b.map((x) => (x === sorgula(b) ? { ...x, gosterge: { tur: 'alan', anahtar: 'il' }, zamanAsimiSn: 5 } : x)));
    expect(il.hatalar).toEqual([]);
    expect(adimKosusu(il.model as Nesne, 'sorgu')).toMatchObject({ basariGostergesi: { tur: 'eleman', deger: '#il' }, zamanAsimiSn: 5 });
    expect(() => ekranModeliniDogrula(`${EKRAN_ANAHTAR}.model.json`, il.model, (dosya: string) => { throw new Error(`yok: ${dosya}`); })).not.toThrow();
    // Son adım: yazı + kap; ardındaki mesaj bloğu kalkar.
    const yazi = diyagramdanModel(m, (b) => {
      const k = b.filter((x) => x.tur === 'aksiyon').at(-1);
      return b.filter((x) => x.tur !== 'mesaj').map((x) => (x === k ? { ...x, gosterge: { tur: 'metin', deger: 'Kayıt tamam', secici: '#sonuc' }, zamanAsimiSn: 12 } : x));
    });
    expect(yazi.hatalar).toEqual([]);
    expect(adimKosusu(yazi.model as Nesne, 'kayit')).toMatchObject({ basariGostergesi: { tur: 'metin', deger: 'Kayıt tamam', secici: '#sonuc' }, zamanAsimiSn: 12 });
    // Sayfada seçilen öğe (sabit yazısı yok) → eleman.
    const oge = diyagramdanModel(m, (b) => b.map((x) => (x === sorgula(b) ? { ...x, gosterge: { tur: 'oge', secici: '#ilSatiri', metin: '' } } : x)));
    expect(adimKosusu(oge.model as Nesne, 'sorgu').basariGostergesi).toEqual({ tur: 'eleman', deger: '#ilSatiri' });

    // Seçimle birlikte beklenen mesaj, görünürse basılan düğmede seçim, bozuk seçim: anlaşılır hata.
    const mesajli = diyagramdanModel(m, (b) => {
      const k = b.filter((x) => x.tur === 'aksiyon').at(-1);
      return b.map((x) => (x === k ? { ...x, gosterge: { tur: 'alan', anahtar: 'il' } } : x));
    });
    expect(mesajli.hatalar).toEqual(['Bu düğmeden sonra beklenen “Sonra bekler > Değiştir” ile seçildi; bu beklenen mesajı silin ya da seçimi değiştirin.']);
    expect(diyagramdanModel(m, (b) => b.map((x) => (x === sorgula(b) ? { ...x, gosterge: { tur: 'alan', anahtar: 'yok' } } : x))).hatalar)
      .toEqual(['Düğmeden sonra beklenen alan bu ekranda yok (ya da seçicisi yok); başka bir alan seçin.']);
    expect(diyagramdanModel(m, (b) => b.map((x) => (x === sorgula(b) ? { ...x, gosterge: { tur: 'bilinmeyen' } } : x))).hatalar)
      .toEqual(['Düğmeden sonra beklenen (“Sonra bekler”) okunamadı; yeniden seçin.']);
    expect(diyagramdanModel(m, (b) => b.map((x) => (x === sorgula(b) ? { ...x, istegeBagli: true, gosterge: { tur: 'alan', anahtar: 'il' } } : x))).hatalar.join(' '))
      .toContain('“Her senaryoda basılmaz” düğmesinden sonra beklenen seçilmez');
  });
});

// ---- Sunucu, arayüz ve koşu ------------------------------------------------------------------------------------------

test.describe('sunucu, arayüz ve koşu (sahte sayfa)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Bekleme-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let ortakId = '';
  let ikinciId = '';
  const gelenler: Nesne[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const paket = (model: Nesne, anahtar: string, ad: string, urlYolu?: string): Nesne => ({
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar, ad, ...(urlYolu ? { urlYolu } : {}) }, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  });
  const detay = (id: string) => api(`/platform/ekran?projeId=${projeId}&id=${encodeURIComponent(id)}`);
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
  async function tasarimAc(id: string, genislik: number) {
    const s = await sayfaAc(`/#/ekranlar/e/${encodeURIComponent(id)}/akis`, genislik);
    await s.page.getByRole('button', { name: 'Düzenle', exact: true }).click();
    await expect(s.page.getByRole('list', { name: 'Akış diyagramı' })).toBeVisible();
    return s;
  }
  const aksiyon = (page: Page, dugme: string): Locator => page.locator('.tasarim-blogu.tur-aksiyon').filter({ has: page.getByRole('combobox', { name: 'Basılacak düğme' }).locator('option:checked', { hasText: `“${dugme}”` }) });
  async function kos(baslik: string, veri: Nesne): Promise<Nesne> {
    const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
    expect(y.basarili, `${baslik}: ${String(y.mesaj ?? '')}`).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'akis-bekleme-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/sorgu-formu/') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/sorgu-formu/kaydet' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Nesne); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Sonra Bekler Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ortakModel(), ORTAK_ANAHTAR, ORTAK_AD), senaryoIndeksleri: [], ortamIdleri: [] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ekranModel(), EKRAN_ANAHTAR, EKRAN_AD, '/sorgu-formu/'), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ikinciModel(), IKINCI_ANAHTAR, IKINCI_AD, '/sorgu-formu/'), senaryoIndeksleri: [], ortamIdleri: [] });
    const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
    const bul = (a: string) => String(ekranlar.find((e) => e.anahtar === a)?.id);
    [ekranId, ortakId, ikinciId] = [bul(EKRAN_ANAHTAR), bul(ORTAK_ANAHTAR), bul(IKINCI_ANAHTAR)];
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('gerçek vaka: yalnız A dalında açılan kutu beklenince A geçer, B dalı zaman aşımına düşer', async () => {
    test.setTimeout(180_000);
    const a = await kos('Önce A', { tip: 'A', il: 'Ankara', not: 'n1' });
    expect(a.durum, JSON.stringify(a.hataMesaji)).toBe('basarili');
    const b = await kos('Önce B', { tip: 'B', il: 'Bursa' });
    expect(b.durum).toBe('basarisiz');
    expect(String(b.hataMesaji)).toContain('#kutuA');
    expect(String(b.hataMesaji)).toContain('3 sn içinde başarı göstergesi görünmedi');
  });

  test('akış görünümü ve tasarım (1440 px): satır; Değiştir → koşullu alanda uyarı; her dalda görünen alan + zaman aşımı → kaydet → model', async () => {
    test.setTimeout(120_000);
    const once = Number((await detay(ekranId)).surum);
    const { page, bitir } = await sayfaAc(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`, 1440);
    // Görünüm (salt okunur): düğmeli iki adımın satırı.
    await expect(page.locator('.akis-diyagrami .sonra-bekler')).toHaveText([ILK_SATIR, 'Sonra bekler: “Kaydedildi” yazısı görünür · zaman aşımı: Ayarlar’daki adım süresi']);
    await expect(page.locator('.akis-diyagrami').getByRole('button', { name: /^Değiştir/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
    const sorgu = aksiyon(page, 'Sorgula');
    await expect(sorgu.locator('.sonra-bekler-metni')).toHaveText(ILK_SATIR);
    await expect(aksiyon(page, 'Kaydet').locator('.sonra-bekler-metni')).toHaveText('Sonra bekler: “Kaydedildi” yazısı görünür · zaman aşımı: Ayarlar’daki adım süresi');

    await sorgu.getByRole('button', { name: /^Değiştir/ }).click();
    const duz = page.getByRole('group', { name: '“Sorgula” düğmesi: sonra ne beklenir' });
    await expect(duz.getByRole('radio')).toHaveCount(4);
    await duz.getByRole('radio', { name: /Ekrandaki bir alan görünene kadar/ }).check();
    const secim = duz.getByRole('combobox', { name: 'Görünmesi beklenen alan' });
    // Seçici modelden: alanlar ve düğmeler listelenir.
    await expect(secim.locator('option')).toHaveText(['Alan ya da düğme seçin…', 'Tip', 'İl', 'Not', '“Sorgula” düğmesi', '“Kaydet” düğmesi']);
    await secim.selectOption({ label: 'Not' });
    const uyari = duz.getByRole('note', { name: 'Gösterge uyarısı' });
    await expect(uyari).toHaveText('Bu alan koşullu: yalnız Tip = Tip A ise görünür. Diğer dallarda düğmeden sonra görünmez, adım zaman aşımına düşer.');
    await secim.selectOption({ label: 'Tip' });
    await expect(uyari).toContainText('düğmeden önce zaten görünüyor');
    await secim.selectOption({ label: 'İl' });
    await expect(uyari).toBeHidden();
    const sure = duz.getByRole('spinbutton', { name: 'Zaman aşımı (sn)' });
    await expect(sure).toHaveValue('3');
    await sure.fill('0');
    await duz.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(duz.getByRole('alert')).toContainText('Zaman aşımı 1–600 sn arasında tam sayı olmalı');
    await sure.fill('5');
    await tasmaYok(page, 'düzenleyici 1440');
    await kutuTasmaz(duz, 'düzenleyici kutusu 1440');
    await duz.screenshot({ path: test.info().outputPath('sonra-bekler-duzenleyici-1440.png') });
    await duz.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sorgu.locator('.sonra-bekler-metni')).toHaveText('Sonra bekler: İl alanı görünür · zaman aşımı 5 sn');
    await expect(page.getByRole('group', { name: '“Sorgula” düğmesi: sonra ne beklenir' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText(/Akış kaydedildi/).first()).toBeVisible();
    // Kayıt sonrası görünüm yeni metni gösterir.
    await expect(page.locator('.akis-diyagrami .sonra-bekler').first()).toHaveText('Sonra bekler: İl alanı görünür · zaman aşımı 5 sn');
    const d = await detay(ekranId);
    expect(Number(d.surum)).toBe(once + 1);
    const m = d.model as Nesne;
    expect(adimKosusu(m, 'sorgu')).toMatchObject({ basariGostergesi: { tur: 'eleman', deger: '#il' }, zamanAsimiSn: 5 });
    // Varsayılan akışın adımları modelle aynı.
    const varsayilan = (m.akislar as Nesne[]).find((a) => a.varsayilan === true) as Nesne;
    expect(varsayilan.adimlar).toEqual(m.adimlar);
    await bitir();
  });

  test('koşu: seçim kaydedildikten sonra B dalı da geçer (A da geçer)', async () => {
    test.setTimeout(180_000);
    let once = gelenler.length;
    const b = await kos('Sonra B', { tip: 'B', il: 'Bursa' });
    expect(b.durum, JSON.stringify(b.hataMesaji)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ tip: 'B', il: 'Bursa', not: '' }]);
    once = gelenler.length;
    const a = await kos('Sonra A', { tip: 'A', il: 'Adana', not: 'n2' });
    expect(a.durum, JSON.stringify(a.hataMesaji)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ tip: 'A', il: 'Adana', not: 'n2' }]);
  });

  test('tasarım (390 px): yazı göstergesi + kap + zaman aşımı kaydedilir; ardındaki mesaj bloğu kalkar; taşma yok', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await tasarimAc(ekranId, 390);
    await expect(aksiyon(page, 'Sorgula').locator('.sonra-bekler-metni')).toHaveText('Sonra bekler: İl alanı görünür · zaman aşımı 5 sn');
    const kaydet = aksiyon(page, 'Kaydet');
    await expect(page.locator('.tasarim-blogu.tur-mesaj')).toHaveCount(1);
    await kaydet.getByRole('button', { name: /^Değiştir/ }).click();
    const duz = page.getByRole('group', { name: '“Kaydet” düğmesi: sonra ne beklenir' });
    await duz.getByRole('radio', { name: /Bir yazı görünene kadar/ }).check();
    await expect(duz.getByRole('textbox', { name: 'Beklenen yazı' })).toHaveValue('Kaydedildi');
    await duz.getByRole('textbox', { name: 'Kap seçicisi (isteğe bağlı)' }).fill('#sonuc');
    await duz.getByRole('spinbutton', { name: 'Zaman aşımı (sn)' }).fill('12');
    await expect(duz).toContainText('1 beklenen mesaj bloğunun yerine geçer');
    await tasmaYok(page, 'düzenleyici 390');
    await kutuTasmaz(duz, 'düzenleyici kutusu 390');
    await duz.screenshot({ path: test.info().outputPath('sonra-bekler-duzenleyici-390.png') });
    await duz.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(kaydet.locator('.sonra-bekler-metni')).toHaveText('Sonra bekler: “Kaydedildi” yazısı görünür (“#sonuc” içinde) · zaman aşımı 12 sn');
    await expect(page.locator('.tasarim-blogu.tur-mesaj')).toHaveCount(0);
    await tasmaYok(page, 'satır 390');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText(/Akış kaydedildi/).first()).toBeVisible();
    await tasmaYok(page, 'görünüm 390');
    const m = (await detay(ekranId)).model as Nesne;
    expect(adimKosusu(m, 'kayit')).toMatchObject({ basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' }, zamanAsimiSn: 12 });
    expect(adimKosusu(m, 'sorgu')).toMatchObject({ basariGostergesi: { tur: 'eleman', deger: '#il' }, zamanAsimiSn: 5 });
    await bitir();
  });

  test('genel senaryo: ekranın akışında salt okunur (Değiştir yok), kendi sayfasında düzenlenir', async () => {
    test.setTimeout(120_000);
    const ekranda = await tasarimAc(ikinciId, 1440);
    await expect(ekranda.page.locator('.tasarim-blogu.tur-ortak')).toHaveCount(1);
    await expect(ekranda.page.locator('.tasarim-blogu.tur-ortak .sonra-bekler')).toHaveCount(0);
    await expect(ekranda.page.getByRole('button', { name: /^Değiştir/ })).toHaveCount(0);
    await ekranda.bitir();
    const kendi = await tasarimAc(ortakId, 1440);
    const onayla = aksiyon(kendi.page, 'Onayla');
    await expect(onayla.locator('.sonra-bekler-metni')).toHaveText('Sonra bekler: “Onaylandı” yazısı görünür · zaman aşımı: Ayarlar’daki adım süresi');
    await onayla.getByRole('button', { name: /^Değiştir/ }).click();
    const duz = kendi.page.getByRole('group', { name: '“Onayla” düğmesi: sonra ne beklenir' });
    await duz.getByRole('spinbutton', { name: 'Zaman aşımı (sn)' }).fill('8');
    await duz.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(onayla.locator('.sonra-bekler-metni')).toHaveText('Sonra bekler: “Onaylandı” yazısı görünür · zaman aşımı 8 sn');
    await kendi.page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await kendi.page.locator('dialog[open]').getByRole('button', { name: /Kaydet|Güncelle/ }).click();
    await expect(kendi.page.getByText(/kaydedildi/i).first()).toBeVisible();
    expect(adimKosusu((await detay(ortakId)).model as Nesne, 'onayAdimi')).toMatchObject({ basariGostergesi: { tur: 'metin', deger: 'Onaylandı' }, zamanAsimiSn: 8 });
    await kendi.bitir();
  });
});
