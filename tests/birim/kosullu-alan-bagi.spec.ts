// KORUMA TESTLERİ — SEÇİME GÖRE DEĞİŞEN ALAN BAĞI (tablolar/secime-gore-bag.mjs) ve ilgili senaryo formu düzenleri:
//   · Bağ biçimi { tablo, sutun, secimeGore: { alan, degerler } }: kaydet / doğrula / geri yükle, yedek, paket bağlantısı;
//   · Alan bağları ekranında "Seçime göre değişsin" ile tanımlama ve özet satırı ("Tip: A → … · B → …");
//   · Senaryo formunda A / B / C'de doğru tablo ve kayıt grubu; ortak alanlar seçime göre çözülen grupta (öbür grup görünmez);
//     kendiliğinden yazılan başvuru seçimle değişir, elle yazılan / değiştirilen korunur;
//   · Aynı kayıt grubu birden çok adımda tek kutu + bağlantı satırı; aksiyonsuz devam adımı önceki adımın içinde (koşu sırası aynı);
//   · Uyumsuz bağ (her olası bağ ayrı), kullanım sayımı, tablo birleştirmede seçenek bağlarının güncellenmesi;
//   · Etiketsiz alan ("[object Object]" değil, not metni); 1440 / 390 px taşma yok.
// Ayrı Nöbetçi, geçici veritabanı, 127.0.0.1'deki sahte sayfa; dış istek yok. Adlar ve değerler SAHTEDİR (nötr).
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaAc, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet, tabloEkranKullanimi } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { bagOzeti, bagiDonustur, baglariCoz, etiketMetni, olasiBaglar, secimeGoreCoz } from '../../scripts/platform/tablolar/secime-gore-bag.mjs';
import { paketListeleri, testVerisiniDogrula, alanEtiketi } from '../../scripts/platform/tablolar/paket-tablolari.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

// --- Saf modül -------------------------------------------------------------------------------------------------------------
test.describe('saf: seçime göre bağ (secime-gore-bag.mjs)', () => {
  const bag = { tablo: 't1', sutun: 'No', secimeGore: { alan: 'tip', degerler: { B: { tablo: 't2', sutun: 'No2' }, C: { tablo: 't3', sutun: 'No3', etiket: 'ikinci' } } } };

  test('çözüm: değer listede varsa o bağ, yoksa / bilinmiyorsa / başvuruysa varsayılan', () => {
    expect(secimeGoreCoz(bag, 'B')).toEqual({ tablo: 't2', sutun: 'No2' });
    expect(secimeGoreCoz(bag, 'C')).toEqual({ tablo: 't3', sutun: 'No3', etiket: 'ikinci' });
    expect(secimeGoreCoz(bag, 'A')).toEqual({ tablo: 't1', sutun: 'No' });
    expect(secimeGoreCoz(bag, undefined)).toEqual({ tablo: 't1', sutun: 'No' });
    expect(baglariCoz({ no: bag, duz: { tablo: 'x', sutun: 'Y' } }, (id) => (id === 'tip' ? 'B' : undefined))).toEqual({ no: { tablo: 't2', sutun: 'No2' }, duz: { tablo: 'x', sutun: 'Y' } });
    expect(baglariCoz({ no: bag }, () => '${Liste.Tip}')).toEqual({ no: { tablo: 't1', sutun: 'No' } });
  });

  test('olası bağlar, dönüştürme (birleştirme) ve özet satırı', () => {
    expect(olasiBaglar(bag).map((x) => [x.deger, x.tablo])).toEqual([[null, 't1'], ['B', 't2'], ['C', 't3']]);
    const r = bagiDonustur(bag, (x) => (x.tablo === 't2' ? { ...x, tablo: 't9', sutun: 'Yeni' } : null));
    expect(r.degisti).toBe(true);
    expect(r.bag).toEqual({ tablo: 't1', sutun: 'No', secimeGore: { alan: 'tip', degerler: { B: { tablo: 't9', sutun: 'Yeni' }, C: { tablo: 't3', sutun: 'No3', etiket: 'ikinci' } } } });
    expect(bagiDonustur(bag, () => null).degisti).toBe(false);
    const ad = (id: string) => ({ t1: 'Kayıt-A', t2: 'Kayıt-B', t3: 'Kayıt-C' } as Record<string, string>)[id] ?? id;
    expect(bagOzeti(bag, { tabloAdi: ad, kontrolEtiketi: 'Tip', secenekler: ['A', 'B', 'C'] }))
      .toBe('Tip: B → Kayıt-B › No2 · C → Kayıt-C [ikinci] › No3 · diğer → Kayıt-A › No');
    const tam = { tablo: 't1', sutun: 'No', secimeGore: { alan: 'tip', degerler: { A: { tablo: 't1', sutun: 'No' }, B: { tablo: 't2', sutun: 'No' } } } };
    expect(bagOzeti(tam, { tabloAdi: ad, kontrolEtiketi: 'Tip', secenekler: ['A', 'B'] })).toBe('Tip: A → Kayıt-A › No · B → Kayıt-B › No');
  });

  test('etiket metni: ekran → form → not → kimlik; nesne asla "[object Object]" olmaz', () => {
    expect(etiketMetni({ ekran: null, not: 'Etiketsiz açılır liste' }, 'liste1')).toBe('Etiketsiz açılır liste');
    expect(etiketMetni({ ekran: 'Ekrandaki', form: 'Formdaki' }, 'x')).toBe('Ekrandaki');
    expect(etiketMetni({ ekran: null, form: 'Formdaki' }, 'x')).toBe('Formdaki');
    expect(etiketMetni({ ekran: { ic: 1 } }, 'kimlik')).toBe('kimlik');
    expect(etiketMetni('Düz', 'x')).toBe('Düz');
    expect(alanEtiketi({ id: 'liste1', etiket: { ekran: null, not: 'Etiketsiz açılır liste' } })).toBe('Etiketsiz açılır liste');
  });

  test('paket bağlantısında secimeGore: doğrulanır ve seçenek başına koşullu liste üretir', () => {
    const model = { adimlar: [{ id: 's', bolumler: [{ id: 'b', alanlar: [
      { id: 'tip', tip: 'radyo', yapilandirma: 'senaryo', etiket: { ekran: 'Tip' }, secenekler: [{ deger: 'A', metin: 'A' }, { deger: 'B', metin: 'B' }] },
      { id: 'no', tip: 'metin', yapilandirma: 'senaryo', etiket: { ekran: 'No' } }
    ] }] }] };
    const tv = (sg: Nesne) => ({
      tablolar: [{ ad: 'Bir', sutunlar: [{ ad: 'No' }], satirlar: [['1']] }, { ad: 'İki', sutunlar: [{ ad: 'No' }], satirlar: [['2']] }],
      baglantilar: [{ alanId: 'no', tablo: 'Bir', sutun: 'No', secimeGore: sg }]
    });
    expect(testVerisiniDogrula(tv({ alan: 'tip', degerler: { B: { tablo: 'İki', sutun: 'No' } } }), model).hatalar).toEqual([]);
    expect(testVerisiniDogrula(tv({ alan: 'tip', degerler: { B: { tablo: 'Yok', sutun: 'No' } } }), model).hatalar.map((h) => h.yer)).toEqual(['testVerisi.baglantilar[0].secimeGore.degerler.B.tablo']);
    expect(testVerisiniDogrula(tv({ alan: 'olmayan', degerler: { B: { tablo: 'İki', sutun: 'No' } } }), model).hatalar.map((h) => h.yer)).toEqual(['testVerisi.baglantilar[0].secimeGore.alan']);
    const l = paketListeleri(tv({ alan: 'tip', degerler: { B: { tablo: 'İki', sutun: 'No' } } }), model).filter((x) => x.hedef.alan === 'no');
    expect(l.map((x) => [x.baglanti.tablo, x.kosullar, x.degerler.map((d) => d.deger)])).toEqual([['Bir', [], ['1']], ['İki', [{ alan: 'tip', deger: 'B' }], ['2']]]);
  });
});

// --- Yedek (doğrudan veritabanı) -----------------------------------------------------------------------------------------
test('yedek: seçime göre bağ ekran ayarlarıyla birlikte taşınır (dışa → içe, kayıpsız)', async () => {
  const klasor = mkdtempSync(join(tmpdir(), 'kosullu-bag-yedek-'));
  try {
    const parola = `Gecici-Yedek-${randomBytes(6).toString('hex')}`;
    const vt = await veritabaniniHazirla(join(klasor, 'kaynak.db'));
    await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
    const proje = projeKaydet(vt, { ad: 'Yedek Projesi' });
    const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'form', ad: 'Form' });
    const t1 = tabloKaydet(vt, { projeId: proje, ad: 'Bir', sutunlar: [{ ad: 'No' }] });
    const t2 = tabloKaydet(vt, { projeId: proje, ad: 'İki', sutunlar: [{ ad: 'No' }] });
    const bag = { no: { tablo: t1, sutun: 'No', secimeGore: { alan: 'tip', degerler: { B: { tablo: t2, sutun: 'No', etiket: 'ek' } } } } };
    expect(ekranAlanBaglariniKaydet(vt, proje, ekran, bag)).toEqual(bag);
    expect(tabloEkranKullanimi(vt, proje).ekranKullanimi[t2]).toEqual(['Form']);
    const { veri } = yedekOlustur(vt);
    const hedef = await veritabaniniHazirla(join(klasor, 'hedef.db'));
    await yedekIceAktar(hedef, veri, parola, { mod: 'tamYukle' });
    await kasaAc(hedef, parola);
    expect(ekranAlanBaglari(hedef, ekran)).toEqual(bag);
    vt.kapat();
    hedef.kapat();
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});

// --- Nöbetçi + sahte sayfa (127.0.0.1) -----------------------------------------------------------------------------------
const EKRAN = 'Koşullu form';
const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
const tipte = (d: string): Nesne => ({ gorunurluk: { ifade: { alan: 'tip', esit: d } } });
const tikla = (secici: string, metin: string): Nesne => ({ kosu: { aksiyonlar: [{ tur: 'tikla', secici, metin }] } });

function model(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'kosullu-form', ad: EKRAN, aciklama: 'Seçime göre bağ fikstürü (değerler sahte).', ekranUrl: '/form', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [
      { id: 'kimlik', sira: 1, baslik: 'Kimlik', ...tikla('#sorgula', 'Sorgula'), bolumler: [{ id: 'b1', baslik: 'Kimlik', alanlar: [
        alan('aAd', 'metin', 'A adı', tipte('A')), alan('bAd', 'metin', 'B adı', tipte('B')), alan('cAd', 'metin', 'C adı', tipte('C')),
        alan('no', 'metin', 'No'), alan('telefon', 'metin', 'Telefon'),
        alan('sinif', 'secim', 'Sınıf', { secenekler: [{ deger: 'X', metin: 'X' }, { deger: 'Y', metin: 'Y' }] }),
        { ...alan('etiketsiz', 'secim', ''), etiket: { ekran: null, not: 'Etiketsiz açılır liste' }, secenekler: [{ deger: '1', metin: 'Bir' }, { deger: '2', metin: 'İki' }] },
        alan('tip', 'radyo', 'Tip', { konum: { secici: 'input[name="tip"]', kirilganlik: 'orta' }, secenekler: [{ deger: 'A', metin: 'A' }, { deger: 'B', metin: 'B' }, { deger: 'C', metin: 'C' }] })
      ] }] },
      // Aksiyonsuz devam: alanları önceki adımın kayıt gruplarında → formda 1. adımın içinde.
      { id: 'ek', sira: 2, baslik: 'Ek bilgiler', bolumler: [{ id: 'b2', baslik: 'Ek bilgiler', alanlar: [alan('aDogum', 'metin', 'A doğum', tipte('A')), alan('bUnvan', 'metin', 'B unvan', tipte('B'))] }] },
      { id: 'adres', sira: 3, baslik: 'Adres', ...tikla('#devam', 'Devam'), bolumler: [{ id: 'b3', baslik: 'Adres', alanlar: [alan('aSoyad', 'metin', 'A soyadı', tipte('A')), alan('bSoyad', 'metin', 'B soyadı', tipte('B'))] }] },
      // Kendi aksiyonu var: önceki aksiyonlu olsa da birleşmez.
      { id: 'onay', sira: 4, baslik: 'Onay', ...tikla('#onayla', 'Onayla'), bolumler: [{ id: 'b4', baslik: 'Onay', alanlar: [alan('aTel2', 'metin', 'A ikinci telefon', tipte('A'))] }] },
      // Aksiyonsuz ama alanı hiçbir grupta değil: birleşmez.
      { id: 'serbest', sira: 5, baslik: 'Serbest', bolumler: [{ id: 'b5', baslik: 'Serbest', alanlar: [alan('aciklama', 'metin', 'Açıklama')] }] },
      { id: 'bitis', sira: 6, baslik: 'Bitiş', kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Alındı', secici: '#sonuc' } }, bolumler: [{ id: 'b6', baslik: 'Bitiş', alanlar: [alan('son', 'metin', 'Son not')] }] }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

const paket = (): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran: { anahtar: 'kosullu-form', ad: EKRAN, urlYolu: '/form' }, olusturan: 'birim testi', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
  model: model(), senaryoOnerileri: [],
  gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
  bilinmeyenler: []
});

// Sorgu düğmesine basılmadan devam alanları kapalıdır: koşu sırası (sorgu önce, elle alanlar sonra) bozulursa doldurma başarısız olur.
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Form</title></head><body>
<label><input type="radio" name="tip" value="A"> A</label><label><input type="radio" name="tip" value="B"> B</label><label><input type="radio" name="tip" value="C"> C</label>
<input id="aAd"><input id="bAd"><input id="cAd"><input id="no"><input id="telefon">
<select id="sinif"><option value=""></option><option value="X">X</option><option value="Y">Y</option></select>
<select id="etiketsiz"><option value=""></option><option value="1">Bir</option><option value="2">İki</option></select>
<button id="sorgula" type="button">Sorgula</button>
<input id="aDogum" disabled><input id="bUnvan" disabled>
<input id="aSoyad"><input id="bSoyad"><button id="devam" type="button">Devam</button>
<input id="aTel2"><button id="onayla" type="button">Onayla</button>
<input id="aciklama"><input id="son"><button id="gonder" type="button">Gönder</button><p id="sonuc"></p>
<script>
const sira = [];
document.getElementById('sorgula').addEventListener('click', () => { sira.push('sorgula'); document.getElementById('aDogum').disabled = false; document.getElementById('bUnvan').disabled = false; });
document.getElementById('bUnvan').addEventListener('input', () => sira.push('bUnvan'));
document.getElementById('gonder').addEventListener('click', async () => {
  const v = (id) => document.getElementById(id).value;
  const r = (document.querySelector('input[name="tip"]:checked') || { value: '' }).value;
  await fetch('/gonder', { method: 'POST', body: JSON.stringify({ tip: r, bAd: v('bAd'), no: v('no'), telefon: v('telefon'), bUnvan: v('bUnvan'), bSoyad: v('bSoyad'), aciklama: v('aciklama'), sira: [...new Set(sira)] }) });
  document.getElementById('sonuc').textContent = 'Alındı';
});
</script></body></html>`;

test.describe('seçime göre bağ, kayıt grupları ve devam adımı (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kosullu-${randomBytes(6).toString('hex')}`;
  const gelenler: Nesne[] = [];
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const t: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const senaryoAl = async (id: string) => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const senaryoIdBul = async (baslik: string) => {
    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    return String(liste.find((x) => x.baslik === baslik)?.id ?? '');
  };
  const baglariAl = async () => (await basarili(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)) as Nesne;
  const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const alanKap = (page: Page, id: string): Locator => page.locator(`[data-alan="${id}"]`);
  const kutu = (page: Page, ad: string): Locator => page.locator(`.kayit-grubu[data-kayit-grubu="${ad}"]:not(.kayit-grubu-baglanti)`);
  const sec = async (page: Page, metin: string) => { await alanKap(page, 'tip').getByRole('radio', { name: metin, exact: true }).check(); };

  async function formAc(adres: string, genislik = 1440): Promise<{ page: Page; hatalar: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(adres);
    await expect(page.locator('[data-alan="tip"]')).toBeVisible({ timeout: 20_000 });
    return { page, hatalar };
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosullu-bag-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/form') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/gonder' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Nesne); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Koşullu Proje' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === EKRAN)?.id);
    const tablo = async (govde: Nesne) => String((await basarili('/platform/tablo/kaydet', { projeId, ...govde })).tablo.id);
    t.A = await tablo({ ad: 'Kayıt-A', tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'No' }, { ad: 'Telefon' }, { ad: 'Doğum' }, { ad: 'Soyad' }, { ad: 'Telefon2' }],
      satirlar: [{ ad: 'a1', degerler: { Ad: 'Bir Kişi', No: '111', Telefon: '5550001', Doğum: '01.01.1990', Soyad: 'Soy A', Telefon2: '5550011' } }] });
    t.B = await tablo({ ad: 'Kayıt-B', tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'No' }, { ad: 'Telefon' }, { ad: 'Unvan' }, { ad: 'Soyad' }],
      satirlar: [{ ad: 'b1', degerler: { Ad: 'Bir Kurum', No: '222', Telefon: '5550002', Unvan: 'Ünvan B', Soyad: 'Soy B' } }] });
    t.C = await tablo({ ad: 'Kayıt-C', tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'No' }, { ad: 'Telefon' }], satirlar: [{ ad: 'c1', degerler: { Ad: 'Üç', No: '333', Telefon: '5550003' } }] });
    t.L1 = await tablo({ ad: 'Liste-1', tur: 'liste', sutunlar: [{ ad: 'Değer' }], satirlar: [{ degerler: { Değer: 'X' } }, { degerler: { Değer: 'Y' } }] });
    t.L2 = await tablo({ ad: 'Liste-2', tur: 'liste', sutunlar: [{ ad: 'Değer' }], satirlar: [{ degerler: { Değer: 'Q' } }, { degerler: { Değer: 'R' } }] });
    await basarili('/platform/ekran/alan-baglari/kaydet', {
      projeId, ekranId, baglar: {
        aAd: { tablo: t.A, sutun: 'Ad' }, bAd: { tablo: t.B, sutun: 'Ad' }, cAd: { tablo: t.C, sutun: 'Ad' },
        aDogum: { tablo: t.A, sutun: 'Doğum' }, bUnvan: { tablo: t.B, sutun: 'Unvan' }, aSoyad: { tablo: t.A, sutun: 'Soyad' }, bSoyad: { tablo: t.B, sutun: 'Soyad' },
        aTel2: { tablo: t.A, sutun: 'Telefon2' },
        // "No" bağ ekranında seçime göre yapılır (aşağıdaki arayüz testi); burada yalnız varsayılan.
        no: { tablo: t.A, sutun: 'No' },
        telefon: { tablo: t.A, sutun: 'Telefon', secimeGore: { alan: 'tip', degerler: { B: { tablo: t.B, sutun: 'Telefon' }, C: { tablo: t.C, sutun: 'Telefon' } } } },
        sinif: { tablo: t.L1, sutun: 'Değer', secimeGore: { alan: 'tip', degerler: { B: { tablo: t.L2, sutun: 'Değer' } } } }
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

  test('sunucu: kaydet / doğrula / geri yükle; geçersiz seçime göre bağ reddedilir; etiketsiz alan adı not metni', async () => {
    const b = await baglariAl();
    expect(b.baglar.telefon).toEqual({ tablo: t.A, sutun: 'Telefon', secimeGore: { alan: 'tip', degerler: { B: { tablo: t.B, sutun: 'Telefon' }, C: { tablo: t.C, sutun: 'Telefon' } } } });
    const kaydet = (no: Nesne) => api('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { ...b.baglar, no } });
    expect((await kaydet({ tablo: t.A, sutun: 'No', secimeGore: { alan: 'no', degerler: { B: { tablo: t.B, sutun: 'No' } } } })).mesaj).toContain('kendi seçimine göre bağlanamaz');
    expect((await kaydet({ tablo: t.A, sutun: 'No', secimeGore: { alan: 'tip', degerler: { B: { tablo: '../x', sutun: 'No' } } } })).basarili).toBe(false);
    expect((await kaydet({ tablo: t.A, sutun: 'No', secimeGore: 'B' })).basarili).toBe(false);
    // Reddedilen kayıt hiçbir şeyi değiştirmedi.
    expect((await baglariAl()).baglar).toEqual(b.baglar);
    // Kontrol adayları için alan yapısı; etiketsiz alan "[object Object]" değil.
    const g = (id: string) => (b.girdiler as Nesne[]).find((x) => x.id === id) as Nesne;
    expect(g('no').bolum).toBe(g('tip').bolum);
    expect(g('aAd').kosulAlanlari).toEqual(['tip']);
    expect(g('tip').secenekler.map((x: Nesne) => x.deger)).toEqual(['A', 'B', 'C']);
    expect(g('etiketsiz').etiket).toBe('Etiketsiz açılır liste');
    expect(JSON.stringify(b.girdiler)).not.toContain('[object Object]');
  });

  for (const genislik of [1440, 390]) {
    test(`bağ ekranı (${genislik} px): "Seçime göre değişsin" ile tanımlama, özet satırı, kayıt; etiketsiz alan adı; taşma yok`, async () => {
      test.setTimeout(120_000);
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
      const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
      const satir = (id: string) => kart.locator(`.alan-satiri[data-alan="${id}"]`);
      await expect(satir('no')).toBeVisible({ timeout: 20_000 });
      // Telefon zaten seçime göre: özet satırı (A seçeneğinin bağı yok → "diğer").
      await expect(satir('telefon').locator('[data-secime-gore-ozeti]')).toHaveText('Tip: B → Kayıt-B › Telefon · C → Kayıt-C › Telefon · diğer → Kayıt-A › Telefon');
      if (genislik === 1440) {
        await satir('no').getByRole('button', { name: 'Seçime göre değişsin — No' }).click();
        await satir('no').getByRole('combobox', { name: 'No: kontrol alanı' }).selectOption({ label: 'Tip' });
        for (const [d, tablo] of [['A', 'Kayıt-A'], ['B', 'Kayıt-B'], ['C', 'Kayıt-C']]) {
          await satir('no').getByRole('combobox', { name: `No: Tip = ${d} tablo sütunu` }).selectOption({ label: `${tablo} → No` });
        }
        await expect(satir('no').locator('[data-secime-gore-ozeti]')).toHaveText('Tip: A → Kayıt-A › No · B → Kayıt-B › No · C → Kayıt-C › No');
        await expect(kart.locator('.kayit-durumu')).toHaveText('✓ Kaydedildi', { timeout: 10_000 });
        await expect.poll(async () => (await baglariAl()).baglar.no).toEqual({ tablo: t.A, sutun: 'No', secimeGore: { alan: 'tip', degerler: {
          A: { tablo: t.A, sutun: 'No' }, B: { tablo: t.B, sutun: 'No' }, C: { tablo: t.C, sutun: 'No' } } } });
        // Varsayılanı değiştirmek seçime göre bağı silmez.
        await satir('no').getByRole('combobox', { name: 'No tablo sütunu' }).selectOption({ label: 'Kayıt-B → No' });
        await expect.poll(async () => (await baglariAl()).baglar.no?.secimeGore?.alan).toBe('tip');
        await satir('no').getByRole('combobox', { name: 'No tablo sütunu' }).selectOption({ label: 'Kayıt-A → No' });
        await expect.poll(async () => (await baglariAl()).baglar.no?.tablo).toBe(t.A);
        // Seçenekleri aynı bölümde olmayan / kendisi: aday listesinde yalnız Tip (seçenekli radyo / seçim alanları).
        expect(await satir('no').getByRole('combobox', { name: 'No: kontrol alanı' }).locator('option').allTextContents()).toEqual(['— kontrol alanını seçin —', 'Sınıf', 'Etiketsiz açılır liste', 'Tip']);
      } else {
        await expect(satir('no').locator('[data-secime-gore-ozeti]')).toHaveText('Tip: A → Kayıt-A › No · B → Kayıt-B › No · C → Kayıt-C › No');
      }
      // Etiketsiz alan "Bağlamak gerekmeyen alanlar" bölümünde not metniyle.
      const bolum = kart.getByRole('region', { name: 'Bağlamak gerekmeyen alanlar' });
      await bolum.locator('.acilir-dugme').click();
      await expect(bolum.locator('.alan-satiri[data-alan="etiketsiz"] .alan-adi')).toContainText('Etiketsiz açılır liste');
      await expect(kart).not.toContainText('[object Object]');
      await tasmaYok(page);
      expect(await satir('telefon').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
      await satir('no').scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath(`bag-ekrani-${genislik}.png`) });
      expect(hatalar).toEqual([]);
      await baglam.close();
    });
  }

  test('veri sağlığı: her olası bağ ayrı denetlenir (uyumsuz bağ yalnız B seçeneğinde); seçenek tabloları kullanılıyor sayılır', async () => {
    const v = (await basarili(`/platform/tablolar/veri-sagligi?projeId=${projeId}`)) as Nesne;
    const uyumsuz = (v.uyumsuzBaglar as Nesne[]).filter((x) => x.alanId === 'sinif');
    expect(uyumsuz.map((x) => [x.alan, x.tablo, x.duzey])).toEqual([['Sınıf (Tip: B)', 'Liste-2', 'guclu']]);
    expect(uyumsuz[0].metin).toMatch(/^Tip = B: /);
    const kullanilmayan = (v.kullanilmayan as Nesne[]).map((x) => x.ad);
    for (const ad of ['Kayıt-B', 'Kayıt-C', 'Liste-2']) expect(kullanilmayan).not.toContain(ad);
    expect(v.kullanim[t.L2].ekranBaglari).toBe(1);
    // Senaryo formu bağlamı: seçime göre bağlar adla; uyumsuzluk alanın yanında (seçeneği yazılı).
    const f = (await basarili(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`)) as Nesne;
    expect(f.secimeGoreBaglar.no.degerler.C).toEqual({ tablo: 'Kayıt-C', sutun: 'No', gizli: false, kayit: true });
    expect(f.tabloUyumsuzluklari.sinif.metin).toMatch(/^Tip = B: /);
  });

  test('senaryo formu: A / B / C\'de doğru tablo ve kayıt grubu; ortak alanlar seçilen tablonun grubunda, öbür grup görünmez; 1440 / 390 px', async () => {
    test.setTimeout(150_000);
    const { page, hatalar } = await formAc(`/#/senaryolar/yeni/${ekranId}`);
    const ust = (ad: string) => kutu(page, ad).locator('.kayit-grubu-ust');
    // B: Kayıt-B grubu = B'ye özgü alanlar + ortak alanlar (No, Telefon); Kayıt-A ve Kayıt-C grubu hiç yok.
    await sec(page, 'B');
    await expect(kutu(page, 'Kayıt-B')).toBeVisible();
    await expect(ust('Kayıt-B')).toContainText('B adı, No, Telefon, B unvan, B soyadı');
    await expect(page.locator('.kayit-grubu[data-kayit-grubu="Kayıt-A"]:visible')).toHaveCount(0);
    await expect(page.locator('.kayit-grubu[data-kayit-grubu="Kayıt-C"]:visible')).toHaveCount(0);
    // Sınıf (seçim) "Tablodan" seçeneği B'de Liste-2.
    await expect(alanKap(page, 'sinif').locator('optgroup[label="Test verisi tablosundan"] option')).toHaveText('Tablodan: Liste-2 › Değer');
    // Hazır: No ve Telefon B tablosundan.
    await kutu(page, 'Kayıt-B').getByRole('radio', { name: 'Hazır kayıt-b (tablodan)' }).check();
    await expect(alanKap(page, 'no').locator('.kayit-ozeti')).toContainText('Kayıt-B › No');
    await expect(alanKap(page, 'telefon').locator('.kayit-ozeti')).toContainText('Kayıt-B › Telefon');
    // A: tersi; kendiliğinden yazılan başvurular A grubu "Yeni" olduğundan kaldırılır, alanlar A grubunda.
    await sec(page, 'A');
    await expect(kutu(page, 'Kayıt-A')).toBeVisible();
    await expect(ust('Kayıt-A')).toContainText('A adı, No, Telefon');
    await expect(page.locator('.kayit-grubu[data-kayit-grubu="Kayıt-B"]:visible')).toHaveCount(0);
    await expect(alanKap(page, 'no').locator('.kayit-ozeti')).toHaveCount(0);
    await kutu(page, 'Kayıt-A').getByRole('radio', { name: 'Hazır kayıt-a (tablodan)' }).check();
    await expect(alanKap(page, 'no').locator('.kayit-ozeti')).toContainText('Kayıt-A › No');
    // C: Kayıt-C grubu (No + Telefon + C adı).
    await sec(page, 'C');
    await expect(ust('Kayıt-C')).toContainText('C adı, No, Telefon');
    await kutu(page, 'Kayıt-C').getByRole('radio', { name: 'Hazır kayıt-c (tablodan)' }).check();
    await expect(alanKap(page, 'no').locator('.kayit-ozeti')).toContainText('Kayıt-C › No');
    // B'ye dönünce B grubu hâlâ Hazır: boş No / Telefon B başvurusunu kendiliğinden alır.
    await sec(page, 'B');
    await expect(alanKap(page, 'no').locator('.kayit-ozeti')).toContainText('Kayıt-B › No');
    await expect(alanKap(page, 'sinif').locator('optgroup[label="Test verisi tablosundan"] option')).toHaveText('Tablodan: Liste-2 › Değer');
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(kutu(page, 'Kayıt-B')).toBeVisible();
    await tasmaYok(page);
    expect(await kutu(page, 'Kayıt-B').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await alanKap(page, 'aciklama').locator('input[type="text"]').fill('B dalı notu');
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('B hazır');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(() => senaryoIdBul('B hazır'), { timeout: 15_000 }).not.toBe('');
    const s = await senaryoAl(await senaryoIdBul('B hazır'));
    expect(s.veri).toMatchObject({ tip: 'B', bAd: '${Kayıt-B.Ad}', no: '${Kayıt-B.No}', telefon: '${Kayıt-B.Telefon}', bUnvan: '${Kayıt-B.Unvan}', bSoyad: '${Kayıt-B.Soyad}' });
    expect(s.veri).not.toHaveProperty('aAd');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('kendiliğinden yazılan başvuru seçimle değişir; elle yazılan değer ve elle değiştirilen başvuru korunur', async () => {
    test.setTimeout(120_000);
    // Elle değiştirilmiş başvuru: B seçiliyken No, C tablosunu gösteriyor (B'nin bağı değil).
    const id = String((await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Elle başvuru', ortamIdleri: [ortamId], kosuyaDahil: false,
      veri: { baslik: 'Elle başvuru', tip: 'B', no: '${Kayıt-C.No}', sinif: '${Liste-2.Değer}' }
    })).id);
    const { page, hatalar } = await formAc(`/#/senaryolar/duzenle/${id}`);
    await sec(page, 'A');
    // Sınıf'ın başvurusu kendiliğinden yazılmıştı (B'nin bağı): A'da varsayılan bağa (Liste-1) geçer.
    await expect(alanKap(page, 'sinif').locator('select option:checked')).toHaveText('Tablodan: Liste-1 › Değer');
    // Elle yazılan düz değer korunur.
    await alanKap(page, 'telefon').locator('input[type="text"]').fill('Elle 77');
    await sec(page, 'C');
    await sec(page, 'A');
    await expect(alanKap(page, 'telefon').locator('input[type="text"]')).toHaveValue('Elle 77');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await senaryoAl(id)).veri.tip, { timeout: 15_000 }).toBe('A');
    const s = await senaryoAl(id);
    expect(s.veri).toMatchObject({ tip: 'A', no: '${Kayıt-C.No}', telefon: 'Elle 77', sinif: '${Liste-1.Değer}' });
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  for (const genislik of [1440, 390]) {
    test(`aynı grup birden çok adımda tek kutu + bağlantı satırı; aksiyonsuz devam adımı önceki adımın içinde (${genislik} px)`, async () => {
      test.setTimeout(120_000);
      const { page, hatalar } = await formAc(`/#/senaryolar/yeni/${ekranId}`, genislik);
      // Adım numaraları: "Ek bilgiler" 1. adımın içinde; Onay (kendi aksiyonu) ve Serbest (grupsuz alan) birleşmez.
      expect(await page.locator('.adim-karti .adim-no').allTextContents()).toEqual(['1', '2', '3', '4', '5']);
      const ilk = page.locator('.adim-karti').first();
      const devam = ilk.locator('[data-devam-adimi="ek"]');
      await expect(devam.getByRole('heading', { name: '“Sorgula” sonrasında girilecekler' })).toBeVisible();
      await expect(page.locator('.adim-karti[data-adim="onay"] .adim-no')).toHaveText('3');
      await expect(page.locator('.adim-karti[data-adim="serbest"] .adim-no')).toHaveText('4');
      await sec(page, 'A');
      // Kayıt-A: kutu yalnız 1. adımın bölümünde; devam bölümünde, Adres ve Onay adımlarında bağlantı satırı.
      await expect(page.locator('.kayit-grubu[data-kayit-grubu="Kayıt-A"]:not(.kayit-grubu-baglanti):visible')).toHaveCount(1);
      await expect(page.locator('[data-bolum="b1"] .kayit-grubu[data-kayit-grubu="Kayıt-A"]')).not.toHaveClass(/kayit-grubu-baglanti/);
      const baglantilar = page.locator('.kayit-grubu-baglanti[data-kayit-grubu="Kayıt-A"]:visible');
      await expect(baglantilar).toHaveCount(3);
      await expect(baglantilar.first()).toHaveText(/Bu alanlar 1\. adımdaki ‹Kayıt-A› seçiminden gelir\./);
      // Kutudaki seçim iki (üç) adımın alanlarına uygulanır.
      await kutu(page, 'Kayıt-A').getByRole('radio', { name: 'Hazır kayıt-a (tablodan)' }).check();
      for (const id of ['aAd', 'aDogum', 'aSoyad', 'aTel2']) await expect(alanKap(page, id).locator('.kayit-ozeti')).toBeVisible();
      await page.locator('[data-bolum="b3"] .kayit-grubu-baglanti').getByRole('button', { name: 'Kutuya git — Kayıt-A' }).click();
      await expect(kutu(page, 'Kayıt-A').getByRole('radio', { name: 'Hazır kayıt-a (tablodan)' })).toBeFocused();
      await tasmaYok(page);
      await page.locator('[data-bolum="b2"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: test.info().outputPath(`devam-adimi-${genislik}.png`) });
      expect(hatalar).toEqual([]);
      await page.context().close();
    });
  }

  test('koşu: devam adımı birleştirilse de sıra aynı (sorgu önce, devam alanları sonra); B seçiminde değerler B tablosundan', async () => {
    test.setTimeout(180_000);
    const id = await senaryoIdBul('B hazır');
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: id, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(gelenler.at(-1)).toEqual({ tip: 'B', bAd: 'Bir Kurum', no: '222', telefon: '5550002', bUnvan: 'Ünvan B', bSoyad: 'Soy B', aciklama: 'B dalı notu', sira: ['sorgula', 'bUnvan'] });
  });

  test('tablo birleştirme: seçenek bağındaki tablo kimliği ve sütun adı güncellenir (varsayılan ve diğer seçenekler korunur)', async () => {
    test.setTimeout(120_000);
    const yeni = String((await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kayıt-C2', tur: 'kayit', sutunlar: [{ ad: 'Ad' }, { ad: 'Numara' }, { ad: 'Telefon' }] })).tablo.id);
    const girdi = { projeId, kalanId: yeni, kaynakIdler: [t.C], sutunEslemeleri: { [t.C]: { Ad: 'Ad', No: 'Numara', Telefon: 'Telefon' } } };
    const on = (await basarili('/platform/tablo/birlestir', girdi)).onizleme as Nesne;
    await basarili('/platform/tablo/birlestir', { ...girdi, kip: 'uygula', beklenenImza: on.imza });
    const b = (await baglariAl()).baglar;
    expect(b.no).toEqual({ tablo: t.A, sutun: 'No', secimeGore: { alan: 'tip', degerler: { A: { tablo: t.A, sutun: 'No' }, B: { tablo: t.B, sutun: 'No' }, C: { tablo: yeni, sutun: 'Numara' } } } });
    expect(b.telefon.secimeGore.degerler.C).toEqual({ tablo: yeni, sutun: 'Telefon' });
    expect(b.cAd).toEqual({ tablo: yeni, sutun: 'Ad' });
  });
});
