// KORUMA TESTLERİ — servis analizi saf çıkarımı (scripts/platform/servisler/servis-analizi.mjs) ve örneklerin kayıt / görünüm
// kuralları (servis-ornekleri.mjs): zorunluluk tablosu (boş öğe, xsi:nil, kısmi, WSDL çelişkisi), tip ve biçim, desen, değer kümesi,
// gizli önerisi, tablo eşleştirme (ad + değer örtüşmesi + metin ↔ kod), örnekler arası fark, ad alanı önekleri, alan listesi olmayan
// metot, yeni tablo planı, karar hatırlama. Ağ yok; tüm veri sentetik.
import { expect, test } from '@playwright/test';
import {
  adEslesmesi, desenCikar, oneriyiUygula, oneriyiYoksay, ornekCoz, servisAnalizi, tabloEslesmesi, tipCikar,
  type AnalizDurumu, type AnalizGirdisi, type AnalizOnerisi
} from '../../scripts/platform/servisler/servis-analizi.mjs';
import { ornekIstekleriniDogrula, ornekleriEkle, ornekleriMaskele } from '../../scripts/platform/servisler/servis-ornekleri.mjs';
import type { OperasyonSemasi } from '../../scripts/platform/servisler/servis-govdesi.mjs';

/** SOAP zarfı (işlem öğesi Islem, ad alanı "urn:ornek"). */
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body><Islem xmlns="urn:ornek"><Girdi>${ic}</Girdi></Islem></s:Body></s:Envelope>`;
const SEMA: OperasyonSemasi = {
  ad: 'Islem', kok: 'Islem', ns: 'urn:ornek', alanlar: [{ ad: 'Girdi', cocuklar: [
    { ad: 'Kanal', tip: 'metin' }, { ad: 'Kod', tip: 'metin', zorunlu: true }, { ad: 'Not', tip: 'metin' }, { ad: 'Bayrak', tip: 'metin' },
    { ad: 'Adet', tip: 'tamsayi', zorunlu: true }, { ad: 'Hic', tip: 'metin', zorunlu: true }
  ] }]
};
const analiz = (ornekler: Array<{ ad?: string; govde: string }>, ek: Partial<AnalizGirdisi> = {}) => servisAnalizi({ metot: 'Islem', sema: SEMA, ornekler, ...ek });
const bul = (l: AnalizOnerisi[], tur: string, yol: string) => l.find((o) => o.tur === tur && o.yol === yol);

test('örnek çözümleme: ad alanı önekleri yok sayılır, yollar şemanın yollarıyla eşleşir; boş / nil / tekrar; JSON gövdesi', () => {
  const c = ornekCoz('<a:Envelope xmlns:a="http://schemas.xmlsoap.org/soap/envelope/"><a:Body><b:Islem xmlns:b="urn:ornek"><b:Girdi><b:Kanal>7</b:Kanal><c:Kod xmlns:c="urn:x">K1</c:Kod><b:Not/><b:Bayrak xsi:nil="true"/><b:Adet>1</b:Adet><b:Adet>2</b:Adet></b:Girdi></b:Islem></a:Body></a:Envelope>');
  expect(c.hata).toBeNull();
  expect(c.kok).toBe('Islem');
  expect(c.ns).toBe('urn:ornek');
  expect(Object.fromEntries(c.alanlar)).toEqual({
    'Girdi/Kanal': { durum: 'dolu', deger: '7', coklu: false }, 'Girdi/Kod': { durum: 'dolu', deger: 'K1', coklu: false },
    'Girdi/Not': { durum: 'bos', deger: '', coklu: false }, 'Girdi/Bayrak': { durum: 'nil', deger: '', coklu: false },
    'Girdi/Adet': { durum: 'dolu', deger: '1', coklu: true }
  });
  // Zarfsız, yalnız üst alan (<Girdi>) yapıştırılırsa yollar yine şemaya göre.
  expect([...ornekCoz('<Girdi><Kanal>3</Kanal></Girdi>', { kok: 'Islem', ustAlanlar: ['Girdi'] }).alanlar.keys()]).toEqual(['Girdi/Kanal']);
  // REST: "govde/…" yolları; null → nil; dizi ilk eleman.
  const j = ornekCoz('{"musteriNo":"A1","adres":{"il":"X","posta":null},"satirlar":[{"adet":2}],"bos":""}', { tur: 'rest' });
  expect(Object.fromEntries([...j.alanlar].map(([k, v]) => [k, v.durum]))).toEqual({ 'govde/musteriNo': 'dolu', 'govde/adres/il': 'dolu', 'govde/adres/posta': 'nil', 'govde/satirlar/adet': 'dolu', 'govde/bos': 'bos' });
  expect(ornekCoz('<a><b></a>').hata).toMatch(/XML/);
  expect(ornekCoz('{x', { tur: 'rest' }).hata).toMatch(/JSON/);
});

test('zorunluluk: hep dolu → zorunlu; kısmi → isteğe bağlı; hep boş (<x/>, <x></x>, nil) → boş gönder; hiç yok → öneri yok; WSDL çelişkisi', () => {
  const r = analiz([
    { ad: 'A', govde: zarf('<Kanal>7</Kanal><Kod>K1</Kod><Not/><Bayrak xsi:nil="true"/><Adet>1</Adet>') },
    { ad: 'B', govde: zarf('<Kanal>8</Kanal><Not></Not><Bayrak xsi:nil="true"/>') },
    { ad: 'C', govde: zarf('<Kanal>7</Kanal><Kod>K3</Kod><Not/>') }
  ], { mevcut: { zorunlu: ['Girdi/Adet'] } });
  expect(bul(r.oneriler, 'zorunlu', 'Girdi/Kanal')).toMatchObject({ deger: true, kanit: '3/3 örnekte dolu' });
  // Kısmi: Adet şu an zorunlu → "isteğe bağlı" önerilir; Kod zorunlu değil (mevcut) → isteğe bağlı zaten, öneri yok.
  expect(bul(r.oneriler, 'zorunlu', 'Girdi/Adet')).toMatchObject({ deger: false, baslik: 'İsteğe bağlı', kanit: '1/3 örnekte dolu; 2 örnekte yok' });
  expect(bul(r.oneriler, 'zorunlu', 'Girdi/Kod')).toBeUndefined();
  expect(bul(r.tumOneriler, 'zorunlu', 'Girdi/Kod')).toMatchObject({ deger: false });
  expect(bul(r.oneriler, 'bosGonder', 'Girdi/Not')).toMatchObject({ deger: 'bos', kanit: '3/3 örnekte boş' });
  expect(bul(r.oneriler, 'bosGonder', 'Girdi/Bayrak')).toMatchObject({ deger: 'nil', kanit: '2/3 örnekte boş (xsi:nil), 1 örnekte yok' });
  // Hiç yok: WSDL ne diyorsa (öneri yok).
  expect(r.oneriler.filter((o) => o.yol === 'Girdi/Hic')).toEqual([]);
  // Çelişki: WSDL'de zorunlu (Kod, Adet) ama bazı örneklerde yok; WSDL'de isteğe bağlı (Kanal) ama hep dolu.
  expect(bul(r.oneriler, 'celiski', 'Girdi/Kod')?.kanit).toBe('WSDL\'de zorunlu (minOccurs=1) ama 1/3 örnekte yok');
  expect(bul(r.oneriler, 'celiski', 'Girdi/Kanal')?.kanit).toBe('WSDL\'de isteğe bağlı ama 3/3 örnekte dolu');
  // Alan özeti WSDL işaretiyle birlikte.
  expect(r.alanlar.find((a) => a.yol === 'Girdi/Kod')?.ozet).toBe('2/3 örnekte dolu, 1 örnekte yok · WSDL: zorunlu');
});

test('tip ve biçim: tarih (gg.aa.yyyy / yyyy-aa-gg / ISO), tamsayı, ondalık ayracı, evet/hayır, e-posta; desen ve uzunluk', () => {
  expect(tipCikar(['10.05.1983', '01.02.2020'])).toEqual({ tip: 'tarih', bicim: 'dd.MM.yyyy' });
  expect(tipCikar(['1983-05-10'])).toEqual({ tip: 'tarih', bicim: 'yyyy-MM-dd' });
  expect(tipCikar(['2024-01-02T03:04:05', '2024-01-02T03:04:05.120+03:00'])).toEqual({ tip: 'tarihSaat', bicim: "yyyy-MM-dd'T'HH:mm:ss" });
  expect(tipCikar(['12', '-3'])).toEqual({ tip: 'tamsayi' });
  expect(tipCikar(['12,50', '3'])).toEqual({ tip: 'ondalik', bicim: 'ayrac:,' });
  expect(tipCikar(['12.50'])).toEqual({ tip: 'ondalik', bicim: 'ayrac:.' });
  expect(tipCikar(['true', 'False'])).toEqual({ tip: 'mantiksal', bicim: 'true/false' });
  expect(tipCikar(['E', 'H', 'E'])).toEqual({ tip: 'mantiksal', bicim: 'E/H' });
  expect(tipCikar(['E'])).toBeNull();
  expect(tipCikar(['1', '0'])).toEqual({ tip: 'mantiksal', bicim: '1/0' });
  expect(tipCikar(['ad@ornek.test'])).toEqual({ tip: 'metin', bicim: 'e-posta' });
  // Baştaki sıfırlı kod tamsayı değildir; yer tutucu / maske değer sayılmaz.
  expect(tipCikar(['00123', '00456'])).toBeNull();
  expect(tipCikar(['10000000146'])).toBeNull();
  expect(tipCikar(['${Tablo.Sutun}', '••••••'])).toBeNull();
  expect(desenCikar(['00123', '00456'])).toMatchObject({ desen: '^\\d{5}$', aciklama: 'hep 5 hane' });
  expect(desenCikar(['AB', 'CD'])).toMatchObject({ desen: '^[A-Z]{2}$' });
  expect(desenCikar(['a-1', 'b-2'])).toEqual({ enAzUzunluk: 3, enCokUzunluk: 3, aciklama: 'hep 3 karakter' });
  expect(desenCikar(['12345'])).toBeNull();
  expect(desenCikar(['1', '22'])).toBeNull();
  // Analizde: WSDL tipi metin dışıysa tip önerilmez; değerlerden çıkan tip ve desen öneri olur.
  const r = analiz([{ govde: zarf('<Kanal>00123</Kanal><Not>10.05.1983</Not><Adet>5</Adet>') }, { govde: zarf('<Kanal>00456</Kanal><Not>11.06.1990</Not><Adet>x</Adet>') }]);
  expect(bul(r.oneriler, 'tip', 'Girdi/Not')).toMatchObject({ baslik: 'Tip: tarih (gg.aa.yyyy)', deger: { tip: 'tarih', bicim: 'dd.MM.yyyy' } });
  expect(bul(r.oneriler, 'desen', 'Girdi/Kanal')).toMatchObject({ baslik: 'Desen: hep 5 hane', deger: { desen: '^\\d{5}$', enAzUzunluk: 5, enCokUzunluk: 5 } });
  expect(bul(r.oneriler, 'tip', 'Girdi/Adet')).toBeUndefined();
});

test('değer kümesi (≤ 8 farklı, tekrar var) ve gizli önerisi (gizli ad, 11 hane, kimlik benzeri ad); gizli değer kanıtta görünmez', () => {
  const sema: OperasyonSemasi = { ad: 'Islem', kok: 'Islem', ns: '', alanlar: [{ ad: 'Girdi', cocuklar: [
    { ad: 'Tur', tip: 'metin' }, { ad: 'Parola', tip: 'metin' }, { ad: 'Numara', tip: 'metin' }, { ad: 'KimlikNo', tip: 'metin' }, { ad: 'Liste', tip: 'metin', secenekler: ['P', 'R'] }
  ] }] };
  const r = servisAnalizi({ metot: 'Islem', sema, ornekler: [
    { govde: zarf('<Tur>O</Tur><Parola>gizli-1</Parola><Numara>10000000146</Numara><KimlikNo>x1</KimlikNo><Liste>P</Liste>') },
    { govde: zarf('<Tur>T</Tur><Parola>gizli-2</Parola><Numara>10000000147</Numara><KimlikNo>x2</KimlikNo><Liste>P</Liste>') },
    { govde: zarf('<Tur>O</Tur><Parola>gizli-1</Parola><Numara>10000000146</Numara><KimlikNo>x1</KimlikNo><Liste>R</Liste>') }
  ] });
  expect(bul(r.oneriler, 'degerler', 'Girdi/Tur')).toMatchObject({ deger: ['O', 'T'], kanit: '2 farklı değer: O (2), T (1)' });
  // WSDL listesi olan alanda ve gizli alanda küme önerilmez.
  expect(bul(r.oneriler, 'degerler', 'Girdi/Liste')).toBeUndefined();
  expect(bul(r.oneriler, 'degerler', 'Girdi/Parola')).toBeUndefined();
  expect(bul(r.oneriler, 'gizli', 'Girdi/Parola')?.kanit).toBe('adı gizli ad kuralına uyuyor');
  expect(bul(r.oneriler, 'gizli', 'Girdi/Numara')?.kanit).toBe('11 haneli sayı (kimlik benzeri)');
  expect(bul(r.oneriler, 'gizli', 'Girdi/KimlikNo')?.kanit).toBe('adı kimlik numarası benzeri');
  expect(bul(r.oneriler, 'gizli', 'Girdi/Tur')).toBeUndefined();
  // Gizli alanın değerleri kanıt metinlerine girmez.
  expect(JSON.stringify(r.oneriler)).not.toContain('gizli-1');
  expect(JSON.stringify(r.oneriler)).not.toContain('10000000146');
  // Fazla farklı değer (> 8) → küme yok.
  const cok = servisAnalizi({ metot: 'Islem', sema, ornekler: [...'ABCDEFGHIA'].map((h) => ({ govde: zarf(`<Tur>${h}</Tur>`) })) });
  expect(bul(cok.oneriler, 'degerler', 'Girdi/Tur')).toBeUndefined();
});

test('tablo eşleştirme: ad (aynı / eş anlam / TR↔EN / tablo adı) + değer örtüşmesi + metin ↔ kod karşılığı', () => {
  const tablolar = [
    { id: 't1', ad: 'Ülke', sutunlar: [{ ad: 'Kod' }, { ad: 'Ad', karsiliklar: { 'Türkiye': { servis: 'TR' }, 'Almanya': { servis: 'DE' } } }],
      satirlar: [{ degerler: { Kod: 'TR', Ad: 'Türkiye' } }, { degerler: { Kod: 'DE', Ad: 'Almanya' } }] },
    { id: 't2', ad: 'Giriş', sutunlar: [{ ad: 'Kanal' }, { ad: 'Şifre', gizli: true }], satirlar: [{ degerler: { Kanal: '77', 'Şifre': null } }] },
    { id: 't3', ad: 'Diğer', sutunlar: [{ ad: 'Code' }], satirlar: [{ degerler: { Code: 'ZZ' } }] }
  ];
  expect(adEslesmesi('Country', 'Ülke')).toBe('esAnlam');
  expect(adEslesmesi('CountryCode', 'Ülke kodu')).toBe('esAnlam');
  expect(adEslesmesi('Kanal', 'kanal')).toBe('birebir');
  expect(adEslesmesi('TelNo', 'Telefon')).toBe('esAnlam');
  expect(adEslesmesi('Kanal', 'Ülke')).toBeNull();
  // Tablo adı eşleşmesi + değerler sütunda: "TR, DE 2/2 Ülke.Kod'da var".
  const e = tabloEslesmesi('Country', ['TR', 'DE'], tablolar);
  expect(e).toMatchObject({ tabloId: 't1', sutun: 'Kod', guc: 'guclu', bulunan: 2, toplam: 2, adTuru: 'tablo' });
  expect(e?.kanit).toBe('Ad: Country ↔ Ülke tablosu (eş anlam) · TR, DE 2/2 Ülke.Kod\'da var');
  // Metin ↔ kod: değer "Türkiye" hücresinin karşılığı.
  const k = tabloEslesmesi('Ad', ['TR', 'DE'], [tablolar[0]]);
  expect(k).toMatchObject({ sutun: 'Ad', karsiliklar: [['TR', 'Türkiye'], ['DE', 'Almanya']] });
  expect(k?.kanit).toContain('TR ↔ Türkiye (karşılık)');
  // Aynı ad ama değerler sütunda yok → aday değil (ad değerle çelişiyor); gizli alan yalnız gizli sütuna (adla).
  expect(tabloEslesmesi('Code', ['TR'], [tablolar[2]])).toBeNull();
  expect(tabloEslesmesi('Kanal', ['77'], tablolar)).toMatchObject({ tabloId: 't2', sutun: 'Kanal', kanit: 'Ad: Kanal ↔ Kanal (aynı ad) · 77 1/1 Giriş.Kanal\'da var' });
  expect(tabloEslesmesi('Sifre', [], tablolar, true)).toMatchObject({ tabloId: 't2', sutun: 'Şifre' });
  expect(tabloEslesmesi('Sifre', [], tablolar, false)).toMatchObject({ sutun: 'Şifre' });
  // Analizde: bağ yoksa öneri; bağ aynıysa öneri yok; bağlı sütunda değer yoksa ve aday güçlüyse değiştirme önerisi.
  const sema: OperasyonSemasi = { ad: 'Islem', kok: 'Islem', ns: '', alanlar: [{ ad: 'Girdi', cocuklar: [{ ad: 'Country', tip: 'metin' }] }] };
  const ornekler = [{ govde: zarf('<Country>TR</Country>') }, { govde: zarf('<Country>DE</Country>') }];
  expect(bul(servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar }).oneriler, 'tabloBagi', 'Girdi/Country')).toMatchObject({ deger: { tablo: 't1', sutun: 'Kod' }, guc: 'guclu' });
  expect(bul(servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar, mevcut: { baglar: { 'Girdi/Country': { tablo: 't1', sutun: 'Kod' } } } }).oneriler, 'tabloBagi', 'Girdi/Country')).toBeUndefined();
  const yanlis = bul(servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar, mevcut: { baglar: { 'Girdi/Country': { tablo: 't3', sutun: 'Code' } } } }).oneriler, 'tabloBagi', 'Girdi/Country');
  expect(yanlis?.kanit).toContain('şu anki bağ: 0/2 Diğer.Code\'de var');
});

test('örnekler arası fark (adlı örnekler) ve alan listesi olmayan metottan alan çıkarma (kök / ad alanı örnekten)', () => {
  const r = analiz([
    { ad: 'Bireysel', govde: zarf('<Kanal>7</Kanal><Kod>K1</Kod>') },
    { ad: 'Kurumsal', govde: zarf('<Kanal>7</Kanal><Not>n</Not>') }
  ], { ekKanitlar: [{ ad: 'Senaryo', govde: zarf('<Kanal>${Tablo.Kanal}</Kanal>') }] });
  expect(r.toplam).toBe(3);
  expect(r.adliSayisi).toBe(2);
  expect(r.farklar.map((f) => f.metin)).toEqual([
    'Kod: Bireysel örneğinde dolu, Kurumsal örneğinde boş / yok → Bireysel senaryosunda istenir',
    'Not: Kurumsal örneğinde dolu, Bireysel örneğinde boş / yok → Kurumsal senaryosunda istenir'
  ]);
  // Yer tutuculu ek kanıt "dolu" sayılır.
  expect(bul(r.oneriler, 'zorunlu', 'Girdi/Kanal')?.kanit).toBe('3/3 örnekte dolu');

  const bos = servisAnalizi({ metot: 'Islem', sema: null, ornekler: [{ ad: 'A', govde: zarf('<Kanal>7</Kanal><Grup><Ic>1</Ic></Grup>') }] });
  expect(bos.kok).toBe('Islem');
  expect(bos.ns).toBe('urn:ornek');
  expect(bos.oneriler.filter((o) => o.tur === 'alanEkle').map((o) => [o.yol, o.baslik, (o.deger as { tip: string }).tip])).toEqual([
    ['Girdi/Kanal', 'Alan listesi yok — alan olarak eklensin mi?', 'tamsayi'], ['Girdi/Grup/Ic', 'Alan listesi yok — alan olarak eklensin mi?', 'tamsayi']
  ]);
  // WSDL'de olan şemada örnekteki fazladan öğe: "WSDL'de yok".
  expect(bul(analiz([{ govde: zarf('<Yeni>a</Yeni>') }]).oneriler, 'alanEkle', 'Girdi/Yeni')?.baslik).toBe('WSDL\'de yok — alan olarak eklensin mi?');
});

test('uygula / yoksay: durum değişir, karar hatırlanır; yeni örnek yalnız yeni öneri getirir; yeni tablo planı (kayıt + liste, aynı ad)', () => {
  const ornekler = [{ ad: 'A', govde: zarf('<Kanal>7</Kanal><Not/><Ek>x1</Ek><Tur>O</Tur>') }, { ad: 'B', govde: zarf('<Kanal>8</Kanal><Not/><Ek>x2</Ek><Tur>O</Tur>') },
    { ad: 'C', govde: zarf('<Kanal>9</Kanal><Not/><Ek>x3</Ek><Tur>T</Tur>') }];
  const tablolar = [{ id: 'm1', ad: 'Islem', sutunlar: [{ ad: 'Eski' }], satirlar: [] }];
  const d: AnalizDurumu = { zorunlu: new Set(), baglar: {}, varsayilanlar: {}, kurallar: {}, ekler: [], kararlar: {}, yeniTablolar: [] };
  const calistir = (l = ornekler) => servisAnalizi({ metot: 'Islem', sema: SEMA, ornekler: l, tablolar, ekler: d.ekler,
    mevcut: { zorunlu: [...d.zorunlu], baglar: d.baglar, varsayilanlar: d.varsayilanlar, kurallar: d.kurallar, kararlar: d.kararlar } });
  const r = calistir();
  // Yeni tablolar: Tur liste tablosu (izin verilen değerler), Kanal + Ek kayıt tablosu (satır = örnek adı); aynı adlı tablo var.
  const liste = r.yeniTablolar.find((t) => t.tur === 'liste');
  const kayit = r.yeniTablolar.find((t) => t.tur === 'kayit');
  expect(liste).toMatchObject({ ad: 'Tur', sutunlar: [{ ad: 'Tur', gizli: false }], satirlar: [{ ad: 'O', degerler: { Tur: 'O' } }, { ad: 'T', degerler: { Tur: 'T' } }] });
  expect(kayit).toMatchObject({ ad: 'Islem', ayniAdli: { id: 'm1', ad: 'Islem' }, sutunlar: [{ ad: 'Kanal' }, { ad: 'Ek' }],
    satirlar: [{ ad: 'A', degerler: { Kanal: '7', Ek: 'x1' } }, { ad: 'B', degerler: { Kanal: '8', Ek: 'x2' } }, { ad: 'C', degerler: { Kanal: '9', Ek: 'x3' } }] });
  for (const o of r.oneriler.filter((x) => x.tur !== 'celiski')) oneriyiUygula(d, o);
  oneriyiYoksay(d, r.oneriler.find((x) => x.tur === 'celiski') as AnalizOnerisi);
  expect([...d.zorunlu].sort()).toEqual(['Girdi/Ek', 'Girdi/Kanal', 'Girdi/Tur']);
  expect(d.varsayilanlar).toEqual({ 'Girdi/Not': { kaynak: 'bos' } });
  expect(d.ekler).toEqual([{ yol: 'Girdi/Ek', tip: 'metin' }, { yol: 'Girdi/Tur', tip: 'metin' }]);
  expect(d.kurallar['Girdi/Tur']).toEqual({ degerler: ['O', 'T'] });
  expect(d.baglar['Girdi/Kanal']).toEqual({ tablo: 'yeni:Islem', sutun: 'Kanal' });
  expect(d.baglar['Girdi/Tur']).toEqual({ tablo: 'yeni:Tur', sutun: 'Tur' });
  expect(d.yeniTablolar.map((t) => t.id).sort()).toEqual(['yeni:Islem', 'yeni:Tur']);
  // Uygulanan / yoksayılan öneri yeniden sorulmaz.
  expect(calistir().oneriler).toEqual([]);
  // Yeni örnek: yalnız yeni öneriler (Kanal artık 3/4 → isteğe bağlı; Not'un değeri var → artık boş gönder değil).
  const sonra = calistir([...ornekler, { ad: 'D', govde: zarf('<Not>n</Not><Ek>x4</Ek><Tur>T</Tur>') }]);
  expect(sonra.oneriler.map((o) => `${o.tur} ${o.yol}`).sort()).toEqual(['zorunlu Girdi/Kanal']);
  expect(sonra.oneriler[0]).toMatchObject({ deger: false, kanit: '3/4 örnekte dolu; 1 örnekte yok' });
});

test('örnek isteklerin kaydı: maskeli gizli değer saklanan değerle geri yazılır; görünüm maskeli; içe aktarılan örnek tekrar eklenmez', () => {
  const asil = { id: 'o1', ad: 'A', govde: '<Islem><Parola>asil-deger</Parola><Kanal>7</Kanal></Islem>', kaynak: 'elle' };
  const gorunum = ornekleriMaskele({ ornekIstekler: { Islem: [asil] } }, []);
  expect(gorunum.ornekIstekler?.Islem[0].govde).toBe('<Islem><Parola>••••••</Parola><Kanal>7</Kanal></Islem>');
  const kayit = ornekIstekleriniDogrula({ Islem: [{ ...gorunum.ornekIstekler?.Islem[0], govde: '<Islem><Parola>••••••</Parola><Kanal>8</Kanal></Islem>' }, { ad: '', govde: '<Islem/>' }, { govde: '  ' }] }, { Islem: [asil] }, []);
  expect(kayit.Islem[0]).toEqual({ id: 'o1', ad: 'A', govde: '<Islem><Parola>asil-deger</Parola><Kanal>8</Kanal></Islem>', kaynak: 'elle' });
  expect(kayit.Islem[1]).toMatchObject({ ad: 'Örnek 2', govde: '<Islem/>', kaynak: 'elle' });
  expect(kayit.Islem).toHaveLength(2);
  expect(() => ornekIstekleriniDogrula({ Islem: 'x' }, undefined, [])).toThrow(/dizi/);
  const eklendi = ornekleriEkle({ Islem: [asil] }, 'Islem', [{ ad: 'Dosyadan', govde: asil.govde, kaynak: 'soapui' }, { ad: 'Yeni', govde: '<Islem><Kanal>1</Kanal></Islem>', kaynak: 'soapui' }]);
  expect(eklendi.Islem.map((x) => [x.ad, x.kaynak])).toEqual([['A', 'elle'], ['Yeni', 'soapui']]);
});
