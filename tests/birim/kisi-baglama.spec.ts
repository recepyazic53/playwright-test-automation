// KORUMA TESTLERİ — KİŞİ ALANLARINI TABLOYA BAĞLAMA (Ekran > Test verisi > "Kişi alanlarını tabloya bağla…"):
//  · saf: kişi alanı kategorisi (genel desenler + alan tipi; tahmin değil öneri).
//  · uçtan uca (ayrı Nöbetçi, 127.0.0.1, geçici veritabanı; dış istek yok): sütun eşleme önerisi, satır eşleşmesi, yeni satır (ortama
//    özel dahil), tutarsız kişi atlanır, önizlemede değer yok (gizli / hassas maskeli), onaysız hiçbir şey yazılmaz, onayla bağ + satır +
//    senaryo tek işlemde; kuru doğrulama dönüşümde. Arayüz: pencere masaüstü ve 390px'te taşmaz. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { kisiEtiketiTuret, kisiEtiketleriOner, kisiKategorisi } from '../../scripts/platform/tablolar/kisi-baglama.mjs';
import { akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

test('kişi alanı kategorisi: kimlik / vergi / pasaport / doğum / telefon / e-posta / ad soyad; ilgisiz alan yok', () => {
  const k = (etiket: string, tip = 'metin', id = 'x') => kisiKategorisi({ id, etiket, tip })?.kategori ?? null;
  expect(k('T.C. Kimlik No')).toBe('kimlikNo');
  expect(k('', 'metin', 'tcKimlikNo')).toBe('kimlikNo');
  expect(k('Vergi No')).toBe('vergiNo');
  expect(k('Pasaport numarası')).toBe('pasaportNo');
  expect(k('Doğum Tarihi', 'tarih')).toBe('dogumTarihi');
  expect(k('Cep telefonu')).toBe('telefon');
  expect(k('İrtibat', 'telefon')).toBe('telefon');
  expect(k('E-posta')).toBe('eposta');
  expect(k('Adı Soyadı')).toBe('adSoyad');
  expect(k('Soyadı')).toBe('soyad');
  expect(k('Ürün')).toBeNull();
  expect(k('Kargo firması')).toBeNull();
});

test('kişi etiketi önerisi: tek kişide yok; ikinci telefon, "alıcı / ödeyen" ön ekleri ve bölüm adları ayrı etiket olur', () => {
  expect(kisiEtiketiTuret('Ödeyen T.C. Kimlik No')).toBe('ödeyen');
  expect(kisiEtiketiTuret('Cep telefonu')).toBe('');
  expect(kisiEtiketiTuret('E-posta')).toBe('');
  const oner = (x: Array<[string, string, string, string?]>) => Object.fromEntries(kisiEtiketleriOner(x.map(([alanId, etiket, kategori, bolum = '']) => ({ alanId, etiket, kategori, bolum }))));
  expect(oner([['a', 'Cep telefonu', 'telefon'], ['b', 'E-posta', 'eposta'], ['c', 'Ödeyen kurum', 'ad']])).toEqual({ a: '', b: '', c: '' });
  expect(oner([['a', 'Telefon', 'telefon'], ['b', 'İkinci telefon', 'telefon'], ['c', 'E-posta', 'eposta']])).toEqual({ a: '', b: 'ikinci', c: '' });
  expect(oner([['a', 'Telefon', 'telefon'], ['b', 'Telefon 2', 'telefon']])).toEqual({ a: '', b: 'kişi 2' });
  expect(oner([['a', 'Alıcı adı', 'ad'], ['b', 'Alıcı telefon', 'telefon'], ['c', 'Ödeyen adı', 'ad'], ['d', 'Ödeyen telefon', 'telefon'], ['e', 'Cep telefonu', 'telefon']]))
    .toEqual({ a: 'alıcı', b: 'alıcı', c: 'ödeyen', d: 'ödeyen', e: '' });
  // Alt bölümlerdeki kişiler: alan adında ayırt edici söz yoksa bölüm adından.
  expect(oner([['a', 'Telefon', 'telefon', 'Gönderen bilgileri'], ['b', 'Telefon', 'telefon', 'Alıcı bilgileri']])).toEqual({ a: 'gönderen', b: 'alıcı' });
});

test.describe('uçtan uca: kişi alanlarını bağla (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kisi-${randomBytes(6).toString('hex')}`;
  const DEGERLER = ['10000000146', '10000000222', '19999999990', '18888888880', '5550000001', '5550000002', '5550000009', '5550000008', 'ayse@ornek.test', 'ali@ornek.test', 'zeynep@ornek.test', 'mert@ornek.test'];
  let nobetci: Nobetci;
  let klasor = '';
  let projeId = '';
  let ortamA = '';
  let ortamB = '';
  let ekranId = '';
  let tabloId = '';
  const senaryo: Record<string, string> = {};
  const anahtarlar: Record<string, string> = {};
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const detay = async (id: string, ortamId = ortamA) => (await api(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const tablo = async () => ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.id === tabloId) as Nesne;
  const degerYok = (y: unknown) => { const m = JSON.stringify(y); for (const d of DEGERLER) expect(m.includes(d), 'kişisel değer yanıtta').toBe(false); };

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    klasor = mkdtempSync(join(tmpdir(), 'kisi-baglama-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Mağaza' });
    ortamA = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    ortamB = ortamKaydet(vt, { projeId, ad: 'Diğer', tabanUrl: 'http://127.0.0.1:9/', ayarlar: { riskli: false } });
    tabloId = tabloKaydet(vt, { projeId, ad: 'Müşteri kişileri', sutunlar: [{ ad: 'Kimlik no', gizli: true }, { ad: 'Telefon' }, { ad: 'E-posta' }], satirlar: [
      { ad: 'kisi-1', degerler: { 'Kimlik no': DEGERLER[0], Telefon: DEGERLER[4], 'E-posta': DEGERLER[8] } },
      { ad: 'kisi-2', degerler: { 'Kimlik no': DEGERLER[1], Telefon: DEGERLER[5], 'E-posta': DEGERLER[9] } }
    ] });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const paket = akisPaketi({ anahtar: 'uyelik-formu', ad: 'Üyelik formu' });
    const model = akisModeli() as Nesne;
    model.id = 'uyelik-formu';
    model.ad = 'Üyelik formu';
    const alan = (id: string, etiket: string, ek: Nesne = {}): Nesne => ({ id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek });
    (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push(alan('uyeKimlikNo', 'T.C. Kimlik No', { hassas: true }), alan('uyeTelefon', 'Cep telefonu'), alan('uyeEposta', 'E-posta'));
    paket.model = model;
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamA] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamA}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'Üyelik formu')?.id);
    const kaydet = async (baslik: string, veri: Nesne, ortamIdleri = [ortamA, ortamB]) =>
      String((await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri, veri: { baslik, kategori: 'K1', urun: 'Ürün A', ...veri } })).id);
    senaryo.Eslesen = await kaydet('Kayıtlı üye', { uyeKimlikNo: DEGERLER[0], uyeTelefon: DEGERLER[4], uyeEposta: DEGERLER[8] });
    senaryo.Yeni = await kaydet('Yeni üye', { uyeKimlikNo: DEGERLER[2], uyeTelefon: DEGERLER[6], uyeEposta: DEGERLER[10] });
    senaryo.Tutarsiz = await kaydet('Karışık üye', { uyeTelefon: DEGERLER[4], uyeEposta: DEGERLER[9] });
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('önizleme: sütun önerisi, eşleşti / yeni satır / atlandı; değer gösterilmez; hiçbir şey yazılmaz', async () => {
    const once = JSON.stringify(await tablo());
    const y = await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId });
    degerYok(y);
    const o = y.onizleme as Nesne;
    expect(o.tabloAdi).toBe('Müşteri kişileri');
    expect((o.alanlar as Nesne[]).map((a) => [a.alanId, a.kategori, a.sutun])).toEqual([
      ['uyeKimlikNo', 'kimlikNo', 'Kimlik no'], ['uyeTelefon', 'telefon', 'Telefon'], ['uyeEposta', 'eposta', 'E-posta']
    ]);
    const durum = (s: string) => (o.senaryolar as Nesne[]).filter((x) => x.senaryoId === senaryo[s]).map((x) => [x.durum, x.satir ?? x.onerilenAd ?? x.neden]);
    expect(durum('Eslesen')).toEqual([['eslesti', 'kisi-1']]);
    expect(durum('Yeni')).toEqual([['yeniSatir', 'Yeni üye — kişi']]);
    expect(durum('Tutarsiz')).toEqual([['atlandi', 'kişinin alanları tabloda farklı satırlarda (bir kişinin alanları aynı satırdan gelmeli)']]);
    const donusum = (o.donusum as Nesne[]).filter((x) => x.senaryoId === senaryo.Yeni).map((x) => [x.alan, x.durum]);
    expect(donusum).toEqual(expect.arrayContaining([['uyeKimlikNo', 'cevrilecek'], ['uyeTelefon', 'cevrilecek'], ['uyeEposta', 'cevrilecek']]));
    expect(JSON.stringify(await tablo())).toBe(once);
    expect((await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar).toEqual({});
  });

  test('yeni satır: ortama özel seçimi her ortam için ayrı satır önerir; satır adı değiştirilebilir', async () => {
    const ilk = (await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId })).onizleme as Nesne;
    const anahtar = String((ilk.senaryolar as Nesne[]).find((x) => x.senaryoId === senaryo.Yeni)?.anahtar);
    const o = (await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId, yeniSatirlar: { [anahtar]: { ortamaOzel: true, ad: 'Yeni üye (ortama özel)' } } })).onizleme as Nesne;
    expect((o.senaryolar as Nesne[]).find((x) => x.senaryoId === senaryo.Yeni)).toMatchObject({ durum: 'yeniSatir', ortamaOzel: true, onerilenAd: 'Yeni üye (ortama özel)', ortamlar: ['Deneme', 'Diğer'] });
    anahtarlar.Yeni = anahtar;
  });

  test('onay: bağlar + yeni satırlar + senaryolar tek işlemde; tutarsız kişi düz kalır; gizli değer şifreli satırda', async () => {
    const y = await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId, onay: true, eslemeler: { uyeKimlikNo: 'Kimlik no', uyeTelefon: 'Telefon', uyeEposta: 'E-posta' },
      yeniSatirlar: { [anahtarlar.Yeni]: { ortamaOzel: true, ad: 'Yeni üye (ortama özel)' } } });
    degerYok(y);
    expect(y.uygulandi).toBe(true);
    expect(y.baglanan).toBe(3);
    expect(y.eklenenSatir).toBe(2);
    const baglar = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar as Nesne;
    expect(baglar.uyeTelefon).toEqual({ tablo: tabloId, sutun: 'Telefon' });
    const t = await tablo();
    expect((t.satirlar as Nesne[]).map((r) => [r.ad, r.ortamId, r.doluGizli])).toEqual([
      ['kisi-1', null, ['Kimlik no']], ['kisi-2', null, ['Kimlik no']], ['Yeni üye (ortama özel) · Deneme', ortamA, ['Kimlik no']], ['Yeni üye (ortama özel) · Diğer', ortamB, ['Kimlik no']]
    ]);
    degerYok((t.satirlar as Nesne[]).map((r) => r.degerler['Kimlik no']));
    const yeni = await detay(senaryo.Yeni);
    expect(yeni.veri).toMatchObject({ uyeTelefon: '${Müşteri kişileri.Telefon}', uyeEposta: '${Müşteri kişileri.E-posta}' });
    const tutarsiz = await detay(senaryo.Tutarsiz);
    expect(tutarsiz.veri.uyeTelefon).toBe(DEGERLER[4]);
  });

  test('ikinci kişi: "ödeyen" alanları ayrı etiketle önerilir, iki kişi ayrı satırlardan gelir; etiket değiştirilebilir', async () => {
    const paket = akisPaketi({ anahtar: 'odeme-formu', ad: 'Ödeme formu' });
    const model = akisModeli() as Nesne;
    model.id = 'odeme-formu';
    model.ad = 'Ödeme formu';
    const alan = (id: string, etiket: string): Nesne => ({ id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false });
    (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push(alan('uyeTelefon', 'Cep telefonu'), alan('uyeEposta', 'E-posta'), alan('odeyenTelefon', 'Ödeyen telefonu'), alan('odeyenEposta', 'Ödeyen e-posta'));
    paket.model = model;
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamA] });
    const odeme = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamA}`)) as { ekranlar: Nesne[] }).ekranlar.find((e) => e.ad === 'Ödeme formu')?.id);
    const sid = String((await basarili('/platform/senaryo/kaydet', { projeId, ekranId: odeme, baslik: 'İki kişili ödeme', ortamIdleri: [ortamA],
      veri: { baslik: 'İki kişili ödeme', kategori: 'K1', urun: 'Ürün A', uyeTelefon: DEGERLER[4], uyeEposta: DEGERLER[8], odeyenTelefon: DEGERLER[5], odeyenEposta: DEGERLER[9] } })).id);
    const y = await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId: odeme });
    degerYok(y);
    const o = y.onizleme as Nesne;
    expect((o.alanlar as Nesne[]).map((a) => [a.alanId, a.sutun, a.kisiEtiketi, a.neden ?? null])).toEqual([
      ['uyeTelefon', 'Telefon', '', null], ['uyeEposta', 'E-posta', '', null], ['odeyenTelefon', 'Telefon', 'ödeyen', null], ['odeyenEposta', 'E-posta', 'ödeyen', null]]);
    expect((o.senaryolar as Nesne[]).map((x) => [x.kisiEtiketi, x.durum, x.satir])).toEqual([['', 'eslesti', 'kisi-1'], ['ödeyen', 'eslesti', 'kisi-2']]);
    // Etiket kaldırılırsa aynı etikette aynı tür: ikinci alan bağlanmaz (neden).
    const tek = (await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId: odeme, etiketler: { odeyenTelefon: '', odeyenEposta: '' } })).onizleme as Nesne;
    expect((tek.alanlar as Nesne[]).find((a) => a.alanId === 'odeyenTelefon')).toMatchObject({ sutun: '', neden: expect.stringContaining('farklı bir etiket') });
    // Kullanıcı etiketi değiştirir ve onaylar: bağlar etiketli, senaryo iki ayrı satırdan.
    const etiketler = { odeyenTelefon: 'fatura', odeyenEposta: 'fatura' };
    const r = await basarili('/platform/ekran/kisi-baglama', { projeId, ekranId: odeme, onay: true, etiketler,
      eslemeler: { uyeTelefon: 'Telefon', uyeEposta: 'E-posta', odeyenTelefon: 'Telefon', odeyenEposta: 'E-posta' } });
    degerYok(r);
    expect(r.baglanan).toBe(4);
    const baglar = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${odeme}`)).baglar as Nesne;
    expect(baglar.odeyenTelefon).toEqual({ tablo: tabloId, sutun: 'Telefon', etiket: 'fatura' });
    expect(baglar.uyeTelefon).toEqual({ tablo: tabloId, sutun: 'Telefon' });
    const s = await detay(sid);
    expect(s.veri).toMatchObject({ uyeTelefon: '${Müşteri kişileri.Telefon}', odeyenTelefon: '${Müşteri kişileri[fatura].Telefon}', odeyenEposta: '${Müşteri kişileri[fatura].E-posta}' });
  });

  test('arayüz: pencere öneriyi ve durumları gösterir, değer göstermez; 1280 ve 390px taşma yok', async () => {
    const tarayici = await chromium.launch();
    try {
      for (const [genislik, yukseklik] of [[1280, 900], [390, 844]] as const) {
        const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
        const page = await baglam.newPage();
        await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}`);
        await page.getByRole('tab', { name: 'Test verisi' }).or(page.getByRole('button', { name: 'Test verisi', exact: true })).first().click();
        await page.getByRole('button', { name: 'Kişi alanlarını tabloya bağla…' }).click();
        const d = page.getByRole('dialog', { name: 'Kişi alanlarını tabloya bağla' });
        await expect(d.getByRole('table', { name: 'Kişi alanı eşleme' })).toBeVisible();
        await expect(d.getByRole('combobox', { name: 'Cep telefonu sütunu' })).toHaveValue('Telefon');
        await expect(d.getByRole('table', { name: 'Kişi satırları' })).toContainText('atlandı');
        await expect(d.getByRole('table', { name: 'Kişi alanı eşleme' })).toContainText('zaten bağlı');
        const metin = await d.innerText();
        for (const v of DEGERLER) expect(metin.includes(v)).toBe(false);
        const olcum = await page.evaluate(() => { const x = document.querySelector('dialog[open]') as HTMLElement; return { sayfa: document.documentElement.scrollWidth - innerWidth, diyalog: x.scrollWidth - x.clientWidth }; });
        expect(olcum.sayfa, `${genislik}px`).toBeLessThanOrEqual(2);
        expect(olcum.diyalog, `${genislik}px diyalog`).toBeLessThanOrEqual(2);
        await d.getByRole('button', { name: 'Kapat' }).click();
        await baglam.close();
      }
    } finally { await tarayici.close(); }
  });
});
