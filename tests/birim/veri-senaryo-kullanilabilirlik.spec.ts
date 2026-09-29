// KORUMA TESTLERİ — v1.4 KULLANILABİLİRLİK (test verisi + senaryo; acemi kullanıcı raporu 2.7 / 2.8, öneri 13, 14, 18):
//  1) Bağımlı liste tabloya bağlanınca: üst alan (İl) tabloya bağlı, tablodaki değer "Mavikent", bağımlılık haritası sayfa değeriyle
//     ("01") anahtarlı — harita karşılık (tablo değeri ↔ sayfa değeri) üzerinden eşlenir: senaryo formunda alt liste (İlçe) dolar,
//     doğrulayıcı alt seçimi denetler, koşu sayfaya doğru değerleri yazar. Üst alan "Tablodan" ise satırdan tek değer / birleşim.
//  2) "Koşullara uyan her satır": formdaki seçimle (Müşteri tipi = Bireysel) aynı adlı sütun açıkça gösterilir, "Koşula ekle" ile
//     süzülür; önizleme her satırın neden uyduğunu ve formdaki seçimle çelişkiyi söyler; satır seçimi dili tek biçim.
//  3) Excel'den yapıştır: "Satır adı" başlıklı sütun satır adlarına gider; çok sütunlu tablo yatay kayar, "+ Sütun / + Satır"
//     kesilmez; tablo eklerken tür (kayıt / liste tablosu) sorulur ve kaydedilir.
//  4) Test verisi sayfa açıklaması "(ör." diye yarıda kesilmez.  5) Ekranın Test verisi sekmesinde "input" yerine "alan".
//  6) Radyo alanında "Tablodan" bir seçenek değil, başlıktaki kaynak düğmesidir.
// Ayrı Nöbetçi, geçici veritabanı, 127.0.0.1'deki sahte sayfa; dış istek yok. Değerler UYDURMADIR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { modeleListeleriUygula } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { formSemasiOlustur, secenekleriBul, tumFormAlanlari } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { senaryoyuDogrula } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { formSuzgecleri, satirUyumu } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const EKRAN = 'Başvuru formu';
const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
const IL_SECENEKLERI = [{ deger: '01', metin: 'Mavikent' }, { deger: '02', metin: 'Yeşilova' }];
const ILCE_HARITASI = { '01': [{ deger: 'MA', metin: 'Merkez-A' }], '02': [{ deger: 'LI', metin: 'Liman' }] };

function model(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'basvuru-formu', ad: EKRAN, aciklama: 'Kullanılabilirlik fikstürü (değerler uydurma).', ekranUrl: '/basvuru', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Başvuru bilgileri',
      bolumler: [
        { id: 'adres', baslik: 'Adres', alanlar: [
          alan('il', 'secim', 'İl', { secenekler: IL_SECENEKLERI }),
          alan('ilce', 'secim', 'İlçe', { secenekler: null, bagimlilik: { alan: 'il', secenekHaritasi: ILCE_HARITASI } })
        ] },
        { id: 'musteri', baslik: 'Müşteri', alanlar: [
          alan('musteriTipi', 'radyo', 'Müşteri tipi', { konum: { secici: 'input[name="tip"]', kirilganlik: 'orta' }, secenekler: [{ deger: 'B', metin: 'Bireysel' }, { deger: 'K', metin: 'Kurumsal' }] }),
          alan('kanal', 'radyo', 'Kanal', { konum: { secici: 'input[name="kanal"]', kirilganlik: 'orta' }, secenekler: [{ deger: 'WEB', metin: 'Web' }, { deger: 'SUBE', metin: 'Şube' }] }),
          alan('ad', 'metin', 'Ad'),
          alan('telefon', 'metin', 'Telefon')
        ] }
      ],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }], basariGostergesi: { tur: 'metin', deger: 'Alındı', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

const paket = (): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran: { anahtar: 'basvuru-formu', ad: EKRAN, urlYolu: '/basvuru' }, olusturan: 'birim testi', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
  model: model(), senaryoOnerileri: [],
  gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
  bilinmeyenler: []
});

// İlçe listesi İl seçilince sayfada dolar (bağımlı liste).
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Başvuru</title></head><body>
<select id="il"><option value="">Seçin</option><option value="01">Mavikent</option><option value="02">Yeşilova</option></select>
<select id="ilce"><option value="">Önce il</option></select>
<label><input type="radio" name="tip" value="B"> Bireysel</label><label><input type="radio" name="tip" value="K"> Kurumsal</label>
<label><input type="radio" name="kanal" value="WEB"> Web</label><label><input type="radio" name="kanal" value="SUBE"> Şube</label>
<input id="ad" type="text"><input id="telefon" type="text">
<button id="gonder" type="button">Gönder</button><p id="sonuc"></p>
<script>
const harita = { '01': [['MA', 'Merkez-A']], '02': [['LI', 'Liman']] };
const il = document.getElementById('il');
const ilce = document.getElementById('ilce');
il.addEventListener('change', () => {
  ilce.textContent = '';
  ilce.append(new Option('Seçin', ''));
  for (const [d, m] of harita[il.value] || []) ilce.append(new Option(m, d));
});
document.getElementById('gonder').addEventListener('click', async () => {
  await fetch('/gonder', { method: 'POST', body: JSON.stringify({ il: il.value, ilce: ilce.value }) });
  document.getElementById('sonuc').textContent = 'Alındı';
});
</script></body></html>`;

// --- Saf modüller -------------------------------------------------------------------------------------------------------
test.describe('saf: bağımlı liste ↔ tablo karşılığı, form süzgeçleri', () => {
  const listeler = [{ hedef: { alan: 'il' }, kosullar: [], degerler: [{ deger: 'Mavikent', ekranDegeri: '01' }, { deger: 'Yeşilova', ekranDegeri: '02' }] }];

  test('karşılık: harita tablo değeriyle de anahtarlanır; var olan anahtar değişmez; karşılık yoksa görünen metinden eşlenir', () => {
    const m = modeleListeleriUygula(model(), listeler);
    const ilce = m.adimlar[0].bolumler[0].alanlar[1];
    expect(ilce.bagimlilik.secenekHaritasi['01']).toEqual(ILCE_HARITASI['01']);
    expect(ilce.bagimlilik.secenekHaritasi.Mavikent).toEqual(ILCE_HARITASI['01']);
    expect(ilce.bagimlilik.secenekHaritasi['Yeşilova']).toEqual(ILCE_HARITASI['02']);
    // Girdi değişmez.
    expect(Object.keys(model().adimlar[0].bolumler[0].alanlar[1].bagimlilik.secenekHaritasi)).toEqual(['01', '02']);
    // Karşılık tanımsız (ekranDegeri yok): özgün modelde metni "Mavikent" olan seçeneğin anahtarı ("01") kullanılır.
    const m2 = modeleListeleriUygula(model(), [{ hedef: { alan: 'il' }, kosullar: [], degerler: [{ deger: 'Mavikent' }, { deger: 'Bilinmeyen' }] }]);
    const h2 = m2.adimlar[0].bolumler[0].alanlar[1].bagimlilik.secenekHaritasi;
    expect(h2.Mavikent).toEqual(ILCE_HARITASI['01']);
    expect(h2.Bilinmeyen).toBeUndefined();
  });

  test('form: İl = tablodaki değer → İlçe listesi; İl tablodan (${…}) → satırdan tek değer ya da tüm listelerin birleşimi', () => {
    const sema = formSemasiOlustur(modeleListeleriUygula(model(), listeler));
    const ilce = tumFormAlanlari(sema).find((a) => a.id === 'ilce') as Nesne;
    expect(secenekleriBul(ilce as never, { il: 'Mavikent' }, sema).map((x) => x.deger)).toEqual(['MA']);
    expect(secenekleriBul(ilce as never, { il: 'Yok' }, sema)).toEqual([]);
    const ref = '${İl listesi.İl}';
    expect(secenekleriBul(ilce as never, { il: ref }, sema)).toEqual([]);   // çözücü verilmezse eski davranış
    expect(secenekleriBul(ilce as never, { il: ref }, sema, () => ['Yeşilova', '02']).map((x) => x.deger)).toEqual(['LI']);
    expect(secenekleriBul(ilce as never, { il: ref }, sema, () => null).map((x) => x.deger).sort()).toEqual(['LI', 'MA']);
  });

  test('doğrulayıcı: bağımlı seçim tablodaki üst değere göre denetlenir (düz değer ve tek değerli tablo başvurusu)', () => {
    const m = modeleListeleriUygula(model(), listeler) as Nesne & { adimlar: Nesne[] };
    const dogrula = (veri: Nesne, tabloDegeri?: () => { deger: string; sayfa: string } | null) => senaryoyuDogrula({ baslik: 'x', ...veri }, { model: m, kaynak: 'kayit', ...(tabloDegeri ? { tabloDegeri } : {}) });
    expect(dogrula({ il: 'Mavikent', ilce: 'MA' }).hatalar).toEqual([]);
    expect(dogrula({ il: 'Mavikent', ilce: 'LI' }).hatalar.map((x: Nesne) => x.alan)).toContain('ilce');
    const ref = { il: '${İl listesi.İl}' };
    expect(dogrula({ ...ref, ilce: 'LI' }, () => ({ deger: 'Mavikent', sayfa: '01' })).hatalar.map((x: Nesne) => x.alan)).toContain('ilce');
    expect(dogrula({ ...ref, ilce: 'MA' }, () => ({ deger: 'Mavikent', sayfa: '01' })).hatalar).toEqual([]);
    // Satıra göre değişen (bilinmeyen) değerde alt seçim engellenmez.
    expect(dogrula({ ...ref, ilce: 'LI' }, () => null).hatalar).toEqual([]);
  });

  test('form süzgeçleri: aynı adlı / bağlı sütun, görünen metinle eşleme, koşuldaki sütun atlanır; satır uyumu nedenleri ve çelişki', () => {
    const t = {
      sutunlar: [{ ad: 'Müşteri tipi', gizli: false }, { ad: 'Ad', gizli: false }, { ad: 'Gizli no', gizli: true }],
      satirlar: [
        { id: 'r1', ortamId: null, degerler: { 'Müşteri tipi': 'Bireysel', Ad: 'Deneme Bir', 'Gizli no': null } },
        { id: 'r2', ortamId: null, degerler: { 'Müşteri tipi': 'Kurumsal', Ad: 'Deneme İki', 'Gizli no': null } }
      ]
    };
    const alanlar = [{ etiket: 'Müşteri tipi', deger: 'B', metin: 'Bireysel' }, { etiket: 'Gizli no', deger: 'x' }, { etiket: 'Başka', deger: 'y' }];
    const f = formSuzgecleri(t, {}, alanlar);
    expect(f).toEqual([{ etiket: 'Müşteri tipi', sutun: 'Müşteri tipi', formDegeri: 'Bireysel', tabloDegeri: 'Bireysel' }]);
    expect(formSuzgecleri(t, { 'müşteri tipi': 'Bireysel' }, alanlar)).toEqual([]);
    expect(formSuzgecleri(t, {}, [{ etiket: 'Tip', deger: 'Yok', sutun: 'Müşteri tipi' }])).toEqual([{ etiket: 'Tip', sutun: 'Müşteri tipi', formDegeri: 'Yok', tabloDegeri: null }]);
    expect(satirUyumu(t, t.satirlar[0], {}, f)).toEqual({ nedenler: [], celisenler: [] });
    expect(satirUyumu(t, t.satirlar[1], { Ad: 'Deneme İki' }, f)).toEqual({
      nedenler: ['Ad = Deneme İki'], celisenler: [{ etiket: 'Müşteri tipi', sutun: 'Müşteri tipi', formDegeri: 'Bireysel', satirDegeri: 'Kurumsal' }]
    });
  });
});

// --- Nöbetçi + sahte sayfa (127.0.0.1) -----------------------------------------------------------------------------------
test.describe('arayüz ve koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Ku14-${randomBytes(6).toString('hex')}`;
  const gelenler: Nesne[] = [];
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let ilTabloId = '';
  let musteriTabloId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const tablolar = async () => (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
  const senaryoAl = async (id: string) => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const senaryoIdBul = async (baslik: string) => {
    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    return String(liste.find((x) => x.baslik === baslik)?.id ?? '');
  };

  async function sayfaAc(adres: string, genislik = 1500): Promise<{ page: Page; hatalar: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(adres);
    return { page, hatalar };
  }
  const alanKap = (page: Page, id: string) => page.locator(`[data-alan="${id}"]`);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ku14-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/basvuru') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
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
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Ku14 Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === EKRAN)?.id);
    // İl listesi: tablodaki okunur değer, sayfa değeri karşılıkta (Mavikent ↔ 01).
    ilTabloId = String((await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'İl listesi', tur: 'liste',
      sutunlar: [{ ad: 'İl', karsiliklar: { Mavikent: { sayfa: '01' }, 'Yeşilova': { sayfa: '02' } } }],
      satirlar: [{ degerler: { İl: 'Mavikent' } }, { degerler: { İl: 'Yeşilova' } }]
    })).tablo.id);
    musteriTabloId = String((await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Müşteri', tur: 'kayit', sutunlar: [{ ad: 'Müşteri tipi' }, { ad: 'Ad' }, { ad: 'Telefon' }],
      satirlar: [
        { ad: 'bireysel-1', degerler: { 'Müşteri tipi': 'Bireysel', Ad: 'Deneme Bir', Telefon: '5550000001' } },
        { ad: 'kurumsal-1', degerler: { 'Müşteri tipi': 'Kurumsal', Ad: 'Deneme Kurum', Telefon: '5550000002' } }
      ]
    })).tablo.id);
    const kanalTabloId = String((await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Kanal listesi', tur: 'liste', sutunlar: [{ ad: 'Kanal' }], satirlar: [{ degerler: { Kanal: 'WEB' } }, { degerler: { Kanal: 'SUBE' } }]
    })).tablo.id);
    await basarili('/platform/ekran/alan-baglari/kaydet', {
      projeId, ekranId, baglar: {
        il: { tablo: ilTabloId, sutun: 'İl' }, ad: { tablo: musteriTabloId, sutun: 'Ad' }, telefon: { tablo: musteriTabloId, sutun: 'Telefon' },
        kanal: { tablo: kanalTabloId, sutun: 'Kanal' }
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

  test('1) senaryo formu: İl tablodan gelen değerle seçilince İlçe listesi dolar ("Önce bağlı alanı seçin"de kalmaz); İl tablodan (${…}) iken de liste var', async () => {
    test.setTimeout(90_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const il = alanKap(page, 'il').locator('select');
    const ilce = alanKap(page, 'ilce').locator('select');
    await expect(il).toBeVisible({ timeout: 20_000 });
    await expect(ilce.locator('option').first()).toHaveText('Önce bağlı alanı seçin');
    await il.selectOption({ label: 'Mavikent' });
    await expect(il).toHaveValue('Mavikent');
    await expect(ilce.locator('option')).toHaveText(['Seçin…', 'Merkez-A']);
    await ilce.selectOption({ label: 'Merkez-A' });
    await il.selectOption({ label: 'Yeşilova' });
    await expect(ilce.locator('option')).toHaveText(['Seçin…', 'Liman']);
    await expect(ilce).toHaveValue('');   // eski seçim yeni listede yok → temizlendi
    // İl "Tablodan": iki satır uyuyor (değer satıra göre değişir) → tüm ilçeler.
    await il.selectOption({ label: 'Tablodan: İl listesi › İl' });
    await expect(ilce.locator('option')).toHaveText(['Seçin…', 'Merkez-A', 'Liman']);
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('1) koşu: İl tablodaki değerle (Mavikent) kaydedilen senaryo sayfaya sayfa değerlerini yazar (01 / MA); bağımlı yanlış seçim kaydedilmez', async () => {
    test.setTimeout(180_000);
    const yanlis = await api('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Yanlış ilçe', ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik: 'Yanlış ilçe', il: 'Mavikent', ilce: 'LI' } });
    expect(yanlis.basarili).toBe(false);
    const id = String((await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Tablodaki il', ortamIdleri: [ortamId], kosuyaDahil: false, veri: { baslik: 'Tablodaki il', il: 'Mavikent', ilce: 'MA' }
    })).id);
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: id, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(gelenler.at(-1)).toEqual({ il: '01', ilce: 'MA' });
  });

  test('2) kayıt grubu: "Ayrı test: koşullara uyan her satır" — formdaki Müşteri tipi aynı adlı sütunla gösterilir, satır nedenleri ve çelişki; "Koşula ekle" süzer ve kaydedilir', async () => {
    test.setTimeout(120_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const grup = page.locator('.kayit-grubu');
    await expect(grup).toBeVisible({ timeout: 20_000 });
    await grup.getByRole('radio', { name: 'Hazır müşteri (tablodan)' }).check();
    const secim = grup.locator('select[data-kayit-satiri="0"]');
    // Tek dil: tek test / ayrı test.
    await expect(secim.locator('option').first()).toHaveText('Tek test: koşullara uyan ilk satır');
    await expect(secim.locator('optgroup')).toHaveAttribute('label', 'Tek test: bu satır');
    await secim.selectOption('tumu');
    await expect(secim.locator('option:checked')).toHaveText('Ayrı test: koşullara uyan her satır');
    await expect(grup.getByRole('status')).toContainText('Şu an 2 satır koşullara uyuyor');
    // Koşul yokken her satırın nedeni.
    const onizleme = grup.locator('details.uyan-satirlar');
    await expect(onizleme).toHaveAttribute('open', '');
    await expect(onizleme.locator('li')).toHaveCount(2);
    await expect(onizleme.locator('li').first()).toContainText('Uyuyor: koşul yok, tablodaki her satır uyar');
    // Formda Müşteri tipi = Bireysel: aynı adlı sütun notu + kurumsal satırda çelişki.
    await alanKap(page, 'musteriTipi').getByRole('radio', { name: 'Bireysel' }).check();
    const not = grup.locator('[data-form-suzgeci]');
    await expect(not).toContainText('Formdaki seçimler satırları kendiliğinden süzmez');
    await expect(not).toContainText('Formda Müşteri tipi = Bireysel.');
    await expect(onizleme.locator('li', { hasText: 'kurumsal-1' }).locator('.uyan-celiski')).toHaveText('Formdaki Müşteri tipi (Bireysel) ile çelişiyor: satırda Kurumsal');
    await expect(onizleme.locator('li', { hasText: 'bireysel-1' }).locator('.uyan-celiski')).toHaveCount(0);
    await not.getByRole('button', { name: 'Koşula ekle: Müşteri tipi = Bireysel' }).click();
    await expect(grup.getByRole('status')).toContainText('Şu an 1 satır koşullara uyuyor');
    await expect(grup.locator('[data-form-suzgeci]')).toHaveCount(0);
    await expect(grup.locator('details.uyan-satirlar li')).toHaveCount(1);
    await expect(grup.locator('details.uyan-satirlar li')).toContainText('Uyuyor: Müşteri tipi = Bireysel');
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Bireysel müşteriler');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect.poll(() => senaryoIdBul('Bireysel müşteriler'), { timeout: 15_000 }).not.toBe('');
    const s = await senaryoAl(await senaryoIdBul('Bireysel müşteriler'));
    expect(s.tabloSecimleri).toEqual({ [`${musteriTabloId}|`]: { 'Müşteri tipi': 'Bireysel' } });
    expect(s.veriKosulari).toEqual({ gruplar: { [`${musteriTabloId}|`]: { kip: 'tumu' } } });
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('6) radyo alanı: "Tablodan al" seçenek değil başlıktaki kaynak düğmesi; seçilince seçenekler yerine kaynak kutusu, "Seçeneklerden seç" geri döner', async () => {
    test.setTimeout(90_000);
    const { page, hatalar } = await sayfaAc(`/#/senaryolar/yeni/${ekranId}`);
    const kanal = alanKap(page, 'kanal');
    await expect(kanal.getByRole('radio')).toHaveCount(2, { timeout: 20_000 });
    await expect(kanal.getByRole('radio', { name: /Tablodan/ })).toHaveCount(0);
    await expect(kanal.locator('.radyo-grubu')).not.toContainText('Tablodan');
    await kanal.getByRole('button', { name: 'Kanal: Tablodan: Kanal listesi › Kanal' }).click();
    await expect(kanal.getByRole('radio')).toHaveCount(0);
    await expect(kanal.locator('.kaynak-kutusu')).toContainText('Tablodan: Kanal listesi › Kanal');
    await kanal.getByRole('button', { name: 'Kanal: tablodan almayı kaldır' }).click();
    await expect(kanal.getByRole('radio')).toHaveCount(2);
    await kanal.getByRole('radio', { name: 'Şube' }).check();
    await expect(kanal.getByRole('radio', { name: 'Şube' })).toBeChecked();
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('4 + 5) Test verisi açıklaması "(ör." diye kesilmez; ekranın Test verisi sekmesinde "input" yok, "alan" var', async () => {
    test.setTimeout(90_000);
    const { page, hatalar } = await sayfaAc('/#/veri');
    const kisa = page.locator('.bolum-aciklamasi .kisa-aciklama').first();
    await expect(kisa).toContainText('değer kombinasyonudur (ör. Kanal | Kullanıcı | Parola).');
    expect((await kisa.innerText()).trim()).not.toMatch(/\(ör\.\s*$/);
    await page.goto(`/#/ekranlar/e/${ekranId}/veri`);
    const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
    await expect(kart).toBeVisible({ timeout: 20_000 });
    await expect(kart.locator('.alan-satiri.baslik').first()).toContainText('Alan');
    // "Müşteri tipi" bağlı değil ve Müşteri tablosunda aynı adlı sütun var.
    await expect(kart).toContainText('1 alanın adı bir tablo sütunuyla aynı.');
    expect((await kart.innerText()).toLowerCase()).not.toContain('input');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('3) Excel\'den yapıştır: "Satır adı" satır adına gider; tablo türü sorulur ve kaydedilir; çok sütunda yatay kaydırma, "+ Sütun / + Satır" görünür', async () => {
    test.setTimeout(120_000);
    const { page, hatalar } = await sayfaAc('/#/veri', 1100);
    const nav = page.getByRole('navigation', { name: 'Tablolar' });
    const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
    await nav.getByRole('button', { name: 'Tablo ekle' }).click();
    const tur = duz.locator('fieldset.tablo-turu-secimi');
    await expect(tur.locator('legend')).toHaveText('Tablo türü — bu tablo ne tutuyor?');
    await expect(tur.getByRole('radio', { name: /Kayıt tablosu/ })).toBeVisible();
    await expect(tur.getByRole('radio', { name: /Liste tablosu/ })).toBeChecked();   // tek sütunlu boş tablo: öneri liste
    await duz.getByLabel('Tablo adı').fill('Şube bilgisi');
    await duz.getByText('Excel\'den yapıştır').click();
    await duz.getByLabel('Yapıştırılacak satırlar').fill([
      'SATIR ADI\tKod\tAçıklama\tBölge\tSorumlu birim\tNot',
      'sube-a\tA1\tBirinci uydurma şube\tKuzey\tBirim-1\tyok',
      'sube-b\tB2\tİkinci uydurma şube\tGüney\tBirim-2\tvar'
    ].join('\n'));
    await duz.getByRole('button', { name: 'Yapıştırılanları ekle' }).click();
    await expect(duz.getByLabel('1. satır adı')).toHaveValue('sube-a');
    await expect(duz.getByLabel('2. satır adı')).toHaveValue('sube-b');
    await expect(duz.getByLabel('1. satır Kod')).toHaveValue('A1');
    await expect(duz.getByLabel(/sütunun adı/)).toHaveCount(5);
    for (const g of await duz.getByLabel(/sütunun adı/).all()) expect(await g.inputValue()).not.toMatch(/sat[ıi]r ad[ıi]/i);
    // Çok sütunlu: öneri kayıt tablosu; kullanıcı Liste tablosu seçer.
    await expect(tur.getByRole('radio', { name: /Kayıt tablosu/ })).toBeChecked();
    // Yatay kaydırma: kap kayar, ekle düğmeleri kabın görünen alanında (kesilmez).
    const kap = duz.locator('.veri-tablosu-kap');
    expect(await kap.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    const ekle = duz.locator('th.ekle-sutunu');
    for (const ad of ['Sütun', 'Satır']) {
      const d = ekle.getByRole('button', { name: ad, exact: true });
      await expect(d).toBeVisible();
      const [kk, dk] = [await kap.boundingBox(), await d.boundingBox()];
      expect(dk && kk && dk.x + dk.width <= kk.x + kk.width + 1 && dk.x >= kk.x).toBe(true);
    }
    await duz.locator('fieldset.tablo-turu-secimi').getByRole('radio', { name: /Liste tablosu/ }).check();
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect(nav.getByRole('button', { name: /^Şube bilgisi/ })).toContainText('5 sütun · 2 satır');
    let t = (await tablolar()).find((x) => x.ad === 'Şube bilgisi') as Nesne;
    expect(t.sutunlar.map((s: Nesne) => s.ad)).toEqual(['Kod', 'Açıklama', 'Bölge', 'Sorumlu birim', 'Not']);
    expect(t.satirlar.map((r: Nesne) => r.ad)).toEqual(['sube-a', 'sube-b']);
    expect(t.kaynak?.tabloTuru).toBe('liste');
    await expect(nav.getByRole('group', { name: 'Ekran listeleri' }).getByRole('button', { name: /^Şube bilgisi/ })).toBeVisible();
    // Var olan tabloda tür değiştirilir (sınıflandırma açıkça görünür).
    await expect(duz.locator('fieldset.tablo-turu-secimi legend')).toHaveText('Tablo türü');
    await duz.locator('fieldset.tablo-turu-secimi').getByRole('radio', { name: /Kayıt tablosu/ }).check();
    await duz.getByRole('button', { name: 'Kaydet' }).click();
    await expect.poll(async () => ((await tablolar()).find((x) => x.ad === 'Şube bilgisi') as Nesne).kaynak?.tabloTuru, { timeout: 15_000 }).toBe('kayit');
    await expect(nav.getByRole('group', { name: 'Kişi ve kayıt verileri' }).getByRole('button', { name: /^Şube bilgisi/ })).toBeVisible();
    t = (await tablolar()).find((x) => x.ad === 'Şube bilgisi') as Nesne;
    expect(t.satirlar.map((r: Nesne) => r.ad)).toEqual(['sube-a', 'sube-b']);
    expect(hatalar).toEqual([]);
    await page.context().close();
  });
});
