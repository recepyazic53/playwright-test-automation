// UÇTAN UCA (yerel) — HIZLI TEST, ÇOK ADIMLI SATIŞ FORMU: canlı denemede görülen hataların sahte sayfada yeniden üretimi ve kanıtı.
// Sahte sayfa: hizli-test-satis-fikstur.ts (127.0.0.1; tüm değerler uydurma). Geçici veritabanı ve ayrı Nöbetçi örneği; veri/ klasörüne
// dokunulmaz, tarayıcı yalnız fikstürün kökenine bağlanabilir. Hiçbir alan için değer ÜRETİLMEZ (değerler testin verdiği).
//   1.21 kimlik sorgusu listeyi "SEÇİNİZ"e döndürür → hızlı test, doğrulama koşusu ve normal koşu listeyi yeniden seçer (adım geçer)
//   1.12 "SEÇİNİZ" (value="0") hazır değer sayılmaz, veri durağında sorulur      1.11 href'siz bağlantı düğmeleri ("Onaya gönder") aday
//   1.14 pencerenin gecikmeli metni okunur          1.13/1.16 ilerleme ekranı bitene kadar izlenir, metinleri Devam
//   1.9  değişken metin (tutar, maskeli ad) Bitti önerilmez     1.15 yeniden taramada menü / altbilgi / alan etiketi çip olmaz
//   1.20 bölüm başlığı üst çubuktaki kullanıcı adından alınmaz  1.17 kart / kimlik gizli sütun     1.18 ay / yıl listeleri bağlanır
//   1.10 bitiş ↔ kaydet ↔ adım adım geri dönüş         1.8 Doldur benzer adları yalnız aday gösterir
//   1.22 Dene formdaki kaydedilmemiş değişiklikle koşar   1.19 büyük tablolarla senaryo formu / tablo okuması
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { beklemeMetniMi, bitisKosulu, degiskenMetinMi, hizliSenaryoBasligi, sabitKisim, varsayilanEtiketler } from '../../scripts/platform/hizli-test/akis.mjs';
import { hassasAlanMi, tabloTaslagiKur } from '../../scripts/platform/hizli-test/test-verisi-tablosu.mjs';
import { yerTutucuSecenekMi } from '../../scripts/platform/tarama/yer-tutucu-secenek.mjs';
import { benzerAdMi, doldurAdaylari, tekAnlamliSecim } from '../../scripts/platform/tablolar/doldur-onerisi.mjs';
import { baslikNormal } from '../../scripts/platform/tablolar/tablo-benzerligi.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { SatisUygulamasi } from './hizli-test-satis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Satis-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let uygulama: SatisUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
/** Hızlı testle kaydedilen senaryo (sonraki testler). */
let kayitli: { ekranId: string; senaryoId: string } | null = null;

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
const oturum = async (id: string): Promise<Nesne> => (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
async function bekle(id: string, durumlar: string[], sn = 90): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = await oturum(id);
    if (durumlar.includes(o.durum)) return o;
    if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.soru)?.slice(0, 600)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}
const deger = (d: string | boolean, kaynak = 'elle'): Nesne => ({ deger: d, kaynak });
async function isBitsin(): Promise<void> {
  for (const son = Date.now() + 30_000; Date.now() < son; await new Promise((c) => setTimeout(c, 250))) {
    if (!(await api('/platform/tarama/aktif')).is) return;
  }
  throw new Error('tarayıcı işi bitmedi');
}
async function arayuz<T>(is: (page: Page) => Promise<T>): Promise<T> {
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const r = await is(page);
    expect(hatalar).toEqual([]);
    return r;
  } finally { await tarayici.close(); }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'hizli-satis-'));
  uygulama = new SatisUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Satış Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  // "Doldur" benzer ad önerisi için (1.8): sütun adı alanın adıyla birebir değil ("Doğum tarihi" ↔ sayfada "D.TARİHİ").
  await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişiler', tur: 'kayit', sutunlar: [{ ad: 'Doğum tarihi' }], satirlar: [{ ad: 'Birinci', degerler: { 'Doğum tarihi': '13.04.1998' } }] });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test.describe('saf kurallar', () => {
  test('senaryo başlığı: ad "hızlı test" içeriyorsa ek konmaz (büyük / küçük harf, Türkçe)', () => {
    expect(hizliSenaryoBasligi('Başvuru')).toBe('Başvuru — hızlı test');
    expect(hizliSenaryoBasligi('Başvuru hızlı testi')).toBe('Başvuru hızlı testi');
    expect(hizliSenaryoBasligi('BAŞVURU HIZLI TEST')).toBe('BAŞVURU HIZLI TEST');
  });
  test('1.12 yer tutucu seçenek: SEÇİNİZ / Seçiniz / Lütfen seçin / -- / ilk seçenek ""/"0"/"-1"; gerçek değerler değil', () => {
    for (const [m, d] of [['SEÇİNİZ', '0'], ['Seçiniz', 'x'], ['-- Lütfen seçin --', ''], ['Ülke seçiniz', '5'], ['--', 'a'], ['Please select', 'p'], ['Ay', '0'], ['Yıl', '-1']]) {
      expect(yerTutucuSecenekMi(m, d, true), `${m}/${d}`).toBe(true);
    }
    for (const [m, d, ilk] of [['A.B.D', 'US', true], ['Standart', '1', true], ['0 çocuk', '0', true], ['Yok', '0', false], ['Seçkin paket', 'sp', true]] as const) {
      expect(yerTutucuSecenekMi(m, d, ilk), `${m}/${d}`).toBe(false);
    }
  });

  test('1.9 / 1.13 bitiş önerisi: değişken metin Bitti önerilmez, ilerleme metinleri Devam; yalnız değişken metin Bitti olamaz', () => {
    expect(['6.78 EUR', '377.56 TL', '01.10.2026', 'D*** K***'].map(degiskenMetinMi)).toEqual([true, true, true, true]);
    expect(degiskenMetinMi('Kaydınız oluşturuldu. Kayıt no: 9001')).toBe(false);
    expect(sabitKisim('6.78 EUR')).toBe('EUR');
    expect(sabitKisim('377.56 TL')).toBe('');
    expect(sabitKisim('Tutar: 1.250 TL')).toBe('Tutar:');
    for (const m of ['İşleminiz onaylanırken lütfen bekleyiniz…', '40%', 'Onaylanıyor 0 / 1', 'İşleniyor', 'Yükleniyor']) expect(beklemeMetniMi(m), m).toBe(true);
    const e = varsayilanEtiketler([
      { metin: '6.78 EUR', tur: 'normal', basis: 2 }, { metin: 'D*** K***', tur: 'normal', basis: 2 }, { metin: 'Onaylanıyor 0 / 1', tur: 'normal', basis: 2 },
      { metin: '40%', tur: 'normal', basis: 2 }, { metin: 'Kaydınız oluşturuldu. Kayıt no: 9001', tur: 'normal', basis: 2 }
    ], 2);
    expect(e).toEqual({ '6.78 EUR': null, 'D*** K***': null, 'Onaylanıyor 0 / 1': 'devam', '40%': 'devam', 'Kaydınız oluşturuldu. Kayıt no: 9001': 'bitti' });
    expect(bitisKosulu({ etiketler: { '377.56 TL': 'bitti', 'Tamam': 'bitti' } }).hatalar.join(' ')).toContain('yalnız değişken değer');
    expect(bitisKosulu({ etiketler: { '6.78 EUR': 'bitti' } })).toMatchObject({ bitti: ['EUR'], hatalar: [] });
  });

  test('1.17 hassas alanlar gizli sütun: kart no, CVV, kart sahibi, T.C. / VKN, parola, IBAN, maskeleme adları; ay / yıl açık', () => {
    const t = tabloTaslagiKur({
      baslik: 'S', degerler: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((k) => [k, { deger: '1' }])), ekGizliAdlar: ['musteriAnahtari'],
      alanlar: [
        { anahtar: 'a', etiket: 'Kart sahibi adı', tur: 'text' }, { anahtar: 'b', etiket: 'Kart numarası', tur: 'text' }, { anahtar: 'c', etiket: 'CVC2', tur: 'text' },
        { anahtar: 'd', etiket: 'Son kullanma ay', tur: 'text' }, { anahtar: 'e', etiket: 'T.C.', tur: 'text' }, { anahtar: 'f', etiket: 'VKN', tur: 'text' },
        { anahtar: 'g', etiket: 'IBAN', tur: 'text' }, { anahtar: 'h', etiket: 'Müşteri anahtarı', ad: 'musteriAnahtari', tur: 'text' }, { anahtar: 'i', etiket: 'Doğum tarihi', tur: 'text' },
        { anahtar: 'j', etiket: 'Güvenlik kodu', tur: 'text' }
      ]
    });
    const gizli = Object.fromEntries((t?.tablolar ?? []).flatMap((x) => x.sutunlar.map((s) => [`${x.tabloAdi}.${s.ad}`, s.gizli])));
    expect(gizli).toMatchObject({
      'Kart bilgileri.Kart sahibi adı': true, 'Kart bilgileri.Kart numarası': true, 'Kart bilgileri.CVC2': true, 'Kart bilgileri.Son kullanma ay': false,
      'Kişi bilgileri.Kimlik no': true, 'Kişi bilgileri.Vergi no': true, 'IBAN.IBAN': true, 'Müşteri anahtarı.Müşteri anahtarı': true, 'Kişi bilgileri.Doğum tarihi': false,
      'Kart bilgileri.Güvenlik kodu': true
    });
    expect(hassasAlanMi({ etiket: 'Parola', tur: 'text' }, { tablo: 'Parola', sutun: 'Parola' })).toBe(true);
  });

  test('1.8 Doldur benzer adlar: D.TARİHİ ↔ Doğum tarihi, TELEFON ↔ Cep telefonu, T.C. ↔ Kimlik no — yalnız aday, kendiliğinden dolmaz', () => {
    const n = baslikNormal;
    expect(benzerAdMi(n('D.TARİHİ'), n('Doğum tarihi'))).toBe(true);
    expect(benzerAdMi(n('TELEFON'), n('Cep telefonu'))).toBe(true);
    expect(benzerAdMi(n('T.C.'), n('Kimlik no'))).toBe(true);
    expect(benzerAdMi(n('Tutar'), n('Tarih'))).toBe(false);
    const tablolar = [{ id: 't1', ad: 'Kişi', sutunlar: [{ ad: 'Doğum tarihi' }], satirlar: [{ id: 'r1', ad: 'Bir', degerler: { 'Doğum tarihi': '13.04.1998' } }] }];
    const adaylar = doldurAdaylari({ alan: { id: 'dogum', etiket: 'D.TARİHİ' }, tablolar });
    expect(adaylar.map((a) => [a.sutun, a.neden])).toEqual([['Doğum tarihi', 'benzer']]);
    expect(tekAnlamliSecim(adaylar)).toBeNull();
  });

  test('1.19 tablo okuması: gizli olmayan hücreler kasanın açık anahtarına bağlı önbellekle çözülür (ikinci okuma çok daha hızlı)', async () => {
    const k = mkdtempSync(join(tmpdir(), 'hizli-satis-tablo-'));
    try {
      const vt = await veritabaniniHazirla(join(k, 'p.db'));
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const p = String(projeKaydet(vt, { ad: 'Ölçüm' }));
      for (let i = 0; i < 20; i++) tabloKaydet(vt, { projeId: p, ad: `Liste ${i}`, tur: 'liste', sutunlar: [{ ad: `Liste ${i}` }], satirlar: Array.from({ length: 300 }, (_, j) => ({ ad: `D${j}`, degerler: { [`Liste ${i}`]: `Değer ${i}-${j}` } })) });
      const olc = (): number => { const t = performance.now(); tablolariListele(vt, p); return performance.now() - t; };
      const ilk = olc();
      const sonraki = Math.min(olc(), olc());
      expect(sonraki, `ilk ${Math.round(ilk)} ms, sonraki ${Math.round(sonraki)} ms`).toBeLessThan(ilk * 0.6);
      // Değerler aynı (önbellek doğru metni döner).
      expect(tablolariListele(vt, p).find((t) => t.ad === 'Liste 3')?.satirlar[7].degerler['Liste 3']).toBe('Değer 3-7');
      vt.kapat();
    } finally { rmSync(k, { recursive: true, force: true }); }
  });
});

test('hızlı test: çok adımlı satış formu baştan sona (1.12, 1.11, 1.14, 1.13/1.16, 1.9, 1.15, 1.10, 1.21 doğrulama, 1.17, 1.18, 1.8 arayüz)', async () => {
  test.setTimeout(420_000);
  const b = await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/satis/', ekranAdi: 'Satış formu', izin: 'evet' });
  const id = String(b.id);
  let o = await bekle(id, ['veri'], 180);
  const alanlar0 = o.soru.alanlar as Nesne[];
  const bul = (etiket: string): Nesne => alanlar0.find((a) => a.etiket === etiket) as Nesne;
  // 1.12: "SEÇİNİZ"de kalan liste sorulur (hazır sayılmaz); gerçekten seçili "Standart" hazırdır.
  expect(bul('GİDİLECEK ÜLKE')).toMatchObject({ tur: 'select', hazir: false, mevcut: null });
  expect(bul('ALTERNATİF')).toMatchObject({ hazir: true, mevcut: 'Standart' });
  // 1.8 (arayüz): "D.TARİHİ" için "Doldur" benzer adlı sütunu ADAY gösterir, kendiliğinden doldurmaz.
  await arayuz(async (page) => {
    await page.goto(`/#/hizli-test/o/${id}`);
    const satir = page.locator('.hizli-alan').filter({ hasText: 'D.TARİHİ' });
    await satir.getByRole('button', { name: 'Doldur', exact: true }).click();
    const panel = satir.locator('.doldur-paneli');
    await expect(panel).toContainText('Kişiler › Doğum tarihi');
    await expect(panel).toContainText('adı benzeyen sütun');
    await expect(satir.locator('.hizli-tablo-degeri')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Birinci — 13.04.1998' }).click();
    await expect(satir.locator('.hizli-tablo-degeri')).toHaveText('${Kişiler.Doğum tarihi}');
  });
  const alan = (etiket: string): string => String(bul(etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: {
    [alan('GİDİLECEK ÜLKE')]: deger('LR'), [alan('D.TARİHİ')]: deger('13.04.1998'), [alan('TELEFON')]: deger('5426502153'), [alan('T.C.')]: deger('45520772518')
  } });
  // Evet + tek aday ("Tutar Hesapla"; bağlantı biçimli): basılır. Kimlik sorgusu listeyi sıfırlasa da liste yeniden seçildi (1.21):
  // tutar hesaplandı (ülke uyarısı yok) ve "Onaya gönder" (href'siz bağlantı) aday oldu (1.11).
  o = await bekle(id, ['karar', 'veri', 'hataSorusu'], 120);
  expect(o.durum, JSON.stringify(o.soru)).toBe('karar');
  expect(uygulama.tutarlar).toEqual(['LR']);
  const aday = (metin: string): Nesne => {
    const a = (o.soru.adaylar as Nesne[]).find((x) => x.metin === metin);
    expect(a, JSON.stringify(o.soru.adaylar.map((x: Nesne) => x.metin))).toBeTruthy();
    return a as Nesne;
  };
  const bas = async (metin: string, durumlar = ['karar', 'veri']): Promise<Nesne> => {
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday(metin).secici });
    o = await bekle(id, [...durumlar, 'hataSorusu'], 120);
    expect(o.durum, JSON.stringify(o.soru)).not.toBe('hataSorusu');
    return o.adimlar.findLast((x: Nesne) => x.fark && x.bas?.metin === metin)?.fark as Nesne;
  };
  // 1.14: pencere önce yalnız "Kapat"la açılır, metni 1,8 sn sonra gelir: ilk izlemede okunur.
  const pencere = await bas('Onaya gönder');
  expect(pencere.yeniMetinler.map((m: Nesne) => m.metin)).toContain('Ödeme yöntemini seçiniz');
  expect(pencere.yeniDugmeler).toContain('KREDİ KARTI İLE ÖDE');
  await bas('KREDİ KARTI İLE ÖDE', ['veri']);
  const kartAlanlari = o.soru.alanlar as Nesne[];
  expect(kartAlanlari.map((a) => [a.etiket, a.hazir])).toEqual([
    ['Kart sahibi adı', false], ['Kart sahibi soyadı', false], ['Kart numarası', false], ['CVV', false], ['Son kullanma ay', false], ['Son kullanma yıl', false]
  ]);
  const kart = (etiket: string): string => String(kartAlanlari.find((a) => a.etiket === etiket)?.anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: {
    [kart('Kart sahibi adı')]: deger('DENEME'), [kart('Kart sahibi soyadı')]: deger('KISI'), [kart('Kart numarası')]: deger('4111111111111111'),
    [kart('CVV')]: deger('123'), [kart('Son kullanma ay')]: deger('05'), [kart('Son kullanma yıl')]: deger('2030')
  } });
  o = await bekle(id, ['karar'], 120);
  // 1.13 / 1.16: ilerleme ekranı (ağ isteği olmadan ~4 sn) bitene kadar izlenir; sonuç metni aynı basışta görülür.
  const odeme = await bas('Ödemeyi tamamla', ['karar']);
  expect(odeme.beklemeMetinleri).toEqual(expect.arrayContaining(['İşleminiz onaylanırken lütfen bekleyiniz…', 'Onaylanıyor 0 / 1']));
  expect(odeme.yeniMetinler.map((m: Nesne) => m.metin)).toContain('Kaydınız oluşturuldu. Kayıt no: 9001');
  expect(odeme.sureMs).toBeGreaterThan(3_500);
  // Bitiş etiketleri (1.9, 1.13, 1.15): tutar ve maskeli ad önerilmez; ilerleme metinleri Devam; üst çubuk / altbilgi / alan etiketi yok.
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  const et = o.soru.etiketler as Record<string, string | null>;
  expect(et).toMatchObject({ '6.78 EUR': null, 'D*** K***': null, 'İşleminiz onaylanırken lütfen bekleyiniz…': 'devam', 'Onaylanıyor 0 / 1': 'devam', 'Kaydınız oluşturuldu. Kayıt no: 9001': 'bitti' });
  expect(Object.values(et).filter((x) => x === 'bitti')).toHaveLength(1);
  const yasakCipler = ['DENEME KULLANICISI', '© 2026 Tüm hakları saklıdır.', 'BAŞLANGIÇ', 'D.TARİHİ', 'GİDİLECEK ÜLKE', 'Başvuru bilgileri', 'Ana sayfa'];
  const cipler = (): string[] => (o.soru.gorulenler as Nesne[]).map((g) => g.metin);
  for (const m of yasakCipler) expect(cipler()).not.toContain(m);
  // 1.15: "Sayfayı yeniden tara" basıştan önce de olan metinleri (menü, başlık, alan etiketleri) eklemez.
  const onceki = cipler();
  await basarili('/platform/hizli-test/yeniden-tara', { id, etiketler: et });
  o = await bekle(id, ['bitis']);
  for (const m of yasakCipler) expect(cipler()).not.toContain(m);
  expect(cipler().filter((m) => !onceki.includes(m))).toEqual([]);
  // 1.10: bitişten adım adım zincire dön (etiket saklanır) → yeniden "Burada bitir" → aynı etiketler.
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...et, 'Ödeme yöntemini seçiniz': 'devam' } });
  o = await bekle(id, ['kaydet']);
  await arayuz(async (page) => {
    await page.goto(`/#/hizli-test/o/${id}`);
    const soru = page.locator('.hizli-soru');
    await expect(soru.getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible({ timeout: 30_000 });
    await soru.getByRole('button', { name: 'Bitiş koşulunu düzenle' }).click();
    await expect(soru.getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible();
    await expect(soru.locator('.hizli-bitis-satiri').filter({ hasText: 'Ödeme yöntemini seçiniz' }).getByRole('radio', { name: 'Devam' })).toHaveAttribute('aria-checked', 'true');
    await soru.getByRole('button', { name: 'Adım adım’a dön: zincire devam et' }).click();
    await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible();
  });
  o = await bekle(id, ['karar']);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  expect(o.soru.etiketler['Ödeme yöntemini seçiniz']).toBe('devam');
  await basarili('/platform/hizli-test/bitis', { id, etiketler: o.soru.etiketler });
  o = await bekle(id, ['kaydet']);
  // Doğrulama koşusu: sayfa yeniden açılır, zincir baştan uygulanır (kimlik sorgusu listeyi sıfırlar → yeniden seçilir; 1.21).
  const tutarOnce = uygulama.tutarlar.length;
  await basarili('/platform/hizli-test/dogrula', { id });
  o = await bekle(id, ['kaydet'], 180);
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
  expect(uygulama.tutarlar.slice(tutarOnce)).toEqual(['LR']);
  // Özet: hassas sütunlar gizli (1.17); ay / yıl ve sayfada hazır gelen ALTERNATİF listesi alanlara bağlanır (1.18).
  const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Satış bir' })).ozet as Nesne;
  const tablo = (ad: string): Nesne => (oz.onizleme.tablolar as Nesne[]).find((t) => t.ad === ad) as Nesne;
  expect(Object.fromEntries(tablo('Kart bilgileri').sutunlar.map((s: Nesne) => [s.ad, s.gizli]))).toEqual({
    'Kart sahibi adı': true, 'Kart sahibi soyadı': true, 'Kart numarası': true, CVV: true, 'Son kullanma ay': false, 'Son kullanma yıl': false
  });
  expect(tablo('Kişi bilgileri').sutunlar.find((s: Nesne) => s.ad === 'Kimlik no')).toMatchObject({ gizli: true });
  // Yer tutucu "SEÇİNİZ" satır değil (envanter en çok 300 seçenek okur: SEÇİNİZ + 299 ülke).
  expect(tablo('GİDİLECEK ÜLKE').ornek[0]).toEqual(['A.B.D']);
  expect(tablo('GİDİLECEK ÜLKE').satirSayisi).toBe(299);
  const bagli = (oz.onizleme.baglantilar as Nesne[]).map((x) => `${x.alanEtiketi}→${x.tablo}.${x.sutun}`);
  expect(bagli).toEqual(expect.arrayContaining(['Son kullanma ay→Kart bilgileri.Son kullanma ay', 'Son kullanma yıl→Kart bilgileri.Son kullanma yıl', 'ALTERNATİF→ALTERNATİF.ALTERNATİF', 'GİDİLECEK ÜLKE→GİDİLECEK ÜLKE.GİDİLECEK ÜLKE']));
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Satış bir', secim: oz.secim });
  expect(k).toMatchObject({ kaydedildi: true, dogrulandi: true });
  kayitli = { ekranId: String(k.ekranId), senaryoId: String(k.senaryoId) };
  await isBitsin();
  // 1.20: bölüm başlığı üst çubuktaki kullanıcı adı değil; keşfedilen boş alanlar da modelde (BAŞLANGIÇ, BİTİŞ).
  const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${kayitli.ekranId}`)) as Nesne).model as Nesne;
  const bolumler = (model.adimlar as Nesne[]).flatMap((a) => a.bolumler.map((x: Nesne) => x.baslik));
  expect(bolumler).not.toContain('DENEME KULLANICISI');
  expect(bolumler).toEqual(expect.arrayContaining(['Başvuran bilgileri', 'Kart bilgileri']));
  const modelEtiketleri = (model.adimlar as Nesne[]).flatMap((a) => a.bolumler.flatMap((x: Nesne) => x.alanlar.map((y: Nesne) => y.etiket?.ekran)));
  expect(modelEtiketleri).toEqual(expect.arrayContaining(['BAŞLANGIÇ', 'BİTİŞ', 'ALTERNATİF', 'GİDİLECEK ÜLKE']));
});

test('1.21 normal koşu: kaydedilen senaryo listeyi (kimlik sorgusu sıfırlasa da) seçer, tüm adımlar geçer, ödeme doğru değerlerle gider', async () => {
  test.setTimeout(240_000);
  expect(kayitli).not.toBeNull();
  const once = { p: uygulama.tutarlar.length, o: uygulama.odemeler.length };
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: kayitli?.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.tutarlar.slice(once.p)).toEqual(['LR']);
  expect(uygulama.odemeler.length).toBe(once.o + 1);
  expect(uygulama.odemeler.at(-1)).toMatchObject({ ulke: 'LR', tel: '(542) 650-2153', tc: '45520772518', isim: 'DENEME', kartno: '4111111111111111', ay: '05', yil: '2030' });
});

test('1.22 Dene formdaki kaydedilmemiş değişiklikle koşar (satır seçimi değişir, kaydetmeden denenir); 1.19 büyük tablolarla form açılır', async () => {
  test.setTimeout(300_000);
  expect(kayitli).not.toBeNull();
  // 1.19: 30 liste tablosu × 300 satır (gerçek kasadaki gibi çok sayıda ekran listesi).
  for (let i = 0; i < 30; i++) {
    await basarili('/platform/tablo/kaydet', { projeId, ad: `Liste ${i}`, tur: 'liste', sutunlar: [{ ad: `Liste ${i}` }], satirlar: Array.from({ length: 300 }, (_, j) => ({ ad: `D${j}`, degerler: { [`Liste ${i}`]: `Değer ${i}-${j}` } })) });
  }
  const once = uygulama.tutarlar.length;
  await arayuz(async (page) => {
    await page.goto('/#/sonuclar');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const t0 = Date.now();
    await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(String(kayitli?.senaryoId))}`);
    const ulke = page.getByLabel('GİDİLECEK ÜLKE satırı');
    await expect(ulke).toBeVisible({ timeout: 60_000 });
    console.log(`[1.19] senaryo formu açılışı (31 tablo, ~9300 satır): ${Date.now() - t0} ms`);
    // Başlıkta ham kimlik yok; "Kimliği kopyala" düğmesi (tam kimlik ipucunda).
    await expect(page.locator('.sayfa-basligi .meta')).not.toContainText(String(kayitli?.senaryoId));
    await expect(page.getByRole('button', { name: 'Kimliği kopyala' })).toHaveAttribute('title', `Senaryo kimliği: ${kayitli?.senaryoId}`);
    // Kaydedilmemiş değişiklik: ülke satırı LIBERYA → A.B.D. Kaydetmeden Dene.
    const secenek = await ulke.locator('option').evaluateAll((l) => l.map((x) => ({ deger: (x as HTMLOptionElement).value, metin: (x.textContent ?? '').trim() })));
    const abd = secenek.find((x) => /A\.B\.D/.test(x.metin));
    expect(abd, JSON.stringify(secenek.slice(0, 5))).toBeTruthy();
    await ulke.selectOption(String(abd?.deger));
    await page.getByRole('button', { name: 'Dene', exact: true }).click();
    const onay = page.locator('dialog[open]');
    if (await onay.isVisible().catch(() => false)) await onay.getByRole('button', { name: /Dene|Yine de dene/ }).first().click();
    const sonuc = page.locator('.deneme-sonucu');
    await expect(sonuc.locator('.rozet').first()).toHaveText(/Başarılı|Başarısız|Çalıştırılamadı/, { timeout: 240_000 });
    await expect(page.locator('#deneme-baslik').locator('..')).toContainText('formdaki kaydedilmemiş değişikliklerle denendi');
    await expect(sonuc.locator('.rozet').first()).toHaveText('Başarılı');
    // Sonuç görünür alanda (yapışkan sağ sütunun kaydırılmış görünümünde ve pencerede); kullanıcı aramak zorunda kalmaz.
    await expect.poll(() => page.evaluate(() => {
      const e = document.querySelector('.deneme-sonucu');
      if (!e) return false;
      const r = e.getBoundingClientRect();
      const kap = e.closest('.ozet-sutunu')?.getBoundingClientRect();
      const ust = Math.max(0, kap ? kap.top : 0);
      const alt = Math.min(window.innerHeight, kap ? kap.bottom : window.innerHeight);
      return r.top < alt && r.bottom > ust;
    })).toBe(true);
  });
  // Deneme A.B.D ile koştu (kayıtlı senaryo hâlâ LIBERYA).
  expect(uygulama.tutarlar.slice(once)).toEqual(['US']);
  const s = (await api(`/platform/senaryo?id=${kayitli?.senaryoId}&ortamId=${ortamId}`)) as Nesne;
  expect(JSON.stringify(s.senaryo?.tabloSecimleri ?? s)).toContain('LIBERYA');
});
