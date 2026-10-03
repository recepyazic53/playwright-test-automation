// KORUMA TESTLERİ — servis analizi saf çıkarımı (scripts/platform/servisler/servis-analizi.mjs) ve örneklerin kayıt / görünüm
// kuralları (servis-ornekleri.mjs): örnek durumuna göre zorunluluk (başarılı / hata verdi / bilinmiyor; tek fark / çok fark; WSDL
// çelişki notu), güç sınıfı (güçlü / zayıf; "güçlü önerileri uygula"), tip (WSDL tipi önce; WSDL'de olmayan alanda ≥ 3 gözlem; desen /
// değer kısıtı önerilmez), gizli önerisi, tablo eşleştirme (ad + değer + metin ↔ kod; yalnız değerden zayıf; aynı satır güveni; kopuk
// bağ; tabloya değer ekle), örnekler arası fark, ad alanı önekleri, alan listesi olmayan metot, yeni tablo planı (kavram grupları;
// değer listesi tablosu; evet/hayır liste tablosu olmaz; hata veren örneğin değerleri girmez), karar hatırlama. Ağ yok; veri sentetik.
import { expect, test } from '@playwright/test';
import {
  AD_ESIGI, adEslesmesi, adPuani, baglamUyumlu, bulunmaEki, gucluOneriler, kavramGrubu, oneriyiUygula, oneriyiYoksay, ornekCoz, servisAnalizi, tabloEslesmesi, tipCikar,
  type AnalizDurumu, type AnalizGirdisi, type AnalizOnerisi, type OrnekDurumu
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
type Ornek = { ad?: string; govde: string; durum?: OrnekDurumu };
const analiz = (ornekler: Ornek[], ek: Partial<AnalizGirdisi> = {}) => servisAnalizi({ metot: 'Islem', sema: SEMA, ornekler, ...ek });
const bul = (l: AnalizOnerisi[], tur: string, yol: string) => l.find((o) => o.tur === tur && o.yol === yol);
const hepsi = (l: AnalizOnerisi[], tur: string, yol: string) => l.filter((o) => o.tur === tur && o.yol === yol);
const bosDurum = (b: Partial<AnalizDurumu> = {}): AnalizDurumu => ({ zorunlu: new Set(), baglar: {}, varsayilanlar: {}, kurallar: {}, ekler: [], kararlar: {}, yeniTablolar: [], tabloDegerleri: [], ...b });

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
  expect([...ornekCoz('<Girdi><Kanal>3</Kanal></Girdi>', { kok: 'Islem', ustAlanlar: ['Girdi'] }).alanlar.keys()]).toEqual(['Girdi/Kanal']);
  const j = ornekCoz('{"musteriNo":"A1","adres":{"il":"X","posta":null},"satirlar":[{"adet":2}],"bos":""}', { tur: 'rest' });
  expect(Object.fromEntries([...j.alanlar].map(([k, v]) => [k, v.durum]))).toEqual({ 'govde/musteriNo': 'dolu', 'govde/adres/il': 'dolu', 'govde/adres/posta': 'nil', 'govde/satirlar/adet': 'dolu', 'govde/bos': 'bos' });
  expect(ornekCoz('<a><b></a>').hata).toMatch(/XML/);
  expect(ornekCoz('{x', { tur: 'rest' }).hata).toMatch(/JSON/);
});

test('zorunluluk: başarılı istekte boş / yok → güçlü isteğe bağlı (+ WSDL çelişki notu); her örnekte dolu → yalnız zayıf "zorunlu olabilir"', () => {
  const r = analiz([
    { ad: 'A', durum: 'basarili', govde: zarf('<Kanal>7</Kanal><Kod>K1</Kod><Not/><Adet>1</Adet>') },
    { ad: 'B', durum: 'basarili', govde: zarf('<Kanal>8</Kanal><Not></Not><Adet>2</Adet>') },
    { ad: 'C', govde: zarf('<Kanal>7</Kanal><Kod>K3</Kod><Not/><Adet>3</Adet>') }
  ], { mevcut: { zorunlu: ['Girdi/Kod'] } });
  expect(bul(r.oneriler, 'zorunlu', 'Girdi/Kod')).toMatchObject({ deger: false, guc: 'guclu', kanit: 'Başarılı \'B\' isteğinde yok → servis bu alan olmadan kabul ediyor' });
  expect(bul(r.oneriler, 'celiski', 'Girdi/Kod')).toMatchObject({ guc: 'not', kanit: 'WSDL\'de zorunlu (minOccurs=1) ama başarılı 1 istekte yok' });
  expect(bul(r.oneriler, 'bosGonder', 'Girdi/Not')).toMatchObject({ deger: 'bos', guc: 'guclu', kanit: 'Başarılı \'A\' isteğinde boş (+1 başarılı istek) → servis bu alan olmadan kabul ediyor' });
  expect(bul(r.oneriler, 'zorunlu', 'Girdi/Kanal')).toMatchObject({ deger: true, guc: 'zayif', baslik: 'Zorunlu olabilir',
    kanit: '3/3 örnekte dolu; zorunlu olabilir (kesinleşmesi için WSDL ya da canlı doğrulama)' });
  // WSDL zorunlu ve her örnekte dolu: öneri yok (uyumlu); mevcut zorunlu kutusu öneri uygulanmadan değişmez.
  expect(hepsi(r.oneriler, 'zorunlu', 'Girdi/Adet')).toEqual([]);
  expect(r.alanlar.find((a) => a.yol === 'Girdi/Kod')?.ozet).toBe('2/3 örnekte dolu, 1 örnekte yok · başarılı 1 istekte yok · WSDL: zorunlu');
  expect(hepsi(r.oneriler, 'celiski', 'Girdi/Kanal')).toEqual([]);
  expect(r.oneriler.filter((o) => o.yol === 'Girdi/Hic')).toEqual([]);
});

test('zorunluluk: bilinmiyor → yalnız zayıf (WSDL zorunluysa not); hata veren istek tek alanla ayrılıyorsa güçlü ipucu, çok alanla yalnız not', () => {
  const bilinmiyor = analiz([
    { ad: 'A', govde: zarf('<Kanal>7</Kanal><Kod>K1</Kod><Bayrak xsi:nil="true"/>') },
    { ad: 'B', govde: zarf('<Kod>K2</Kod><Bayrak xsi:nil="true"/>') }
  ], { mevcut: { zorunlu: ['Girdi/Kanal'] } });
  expect(bul(bilinmiyor.oneriler, 'zorunlu', 'Girdi/Kanal')).toMatchObject({ deger: false, guc: 'zayif', baslik: 'İsteğe bağlı olabilir' });
  expect(bul(bilinmiyor.oneriler, 'bosGonder', 'Girdi/Bayrak')).toMatchObject({ deger: 'nil', guc: 'zayif' });
  const wsdl = analiz([{ ad: 'A', govde: zarf('<Kanal>7</Kanal>') }, { ad: 'B', govde: zarf('<Kanal>8</Kanal><Kod>K</Kod>') }]);
  expect(hepsi(wsdl.oneriler, 'zorunlu', 'Girdi/Kod')).toEqual([]);
  expect(bul(wsdl.oneriler, 'celiski', 'Girdi/Kod')).toMatchObject({ guc: 'not', baslik: 'WSDL ile çelişki olabilir' });

  // Tek fark: hata veren istek başarılıdan yalnız Not'un yokluğuyla ayrılıyor → güçlü ipucu (kesin değil).
  const tek = analiz([
    { ad: 'Tamam', durum: 'basarili', govde: zarf('<Kanal>7</Kanal><Not>n</Not><Bayrak>b</Bayrak>') },
    { ad: 'Eksik', durum: 'hata', govde: zarf('<Kanal>7</Kanal><Bayrak>b</Bayrak>') }
  ]);
  expect(bul(tek.oneriler, 'zorunlu', 'Girdi/Not')).toMatchObject({ deger: true, guc: 'guclu', baslik: 'Zorunlu olabilir: bu alan eksikken hata verdi',
    kanit: 'Hata veren \'Eksik\' isteği başarılı \'Tamam\' isteğinden yalnız bu alanın boş / yok olmasıyla ayrılıyor (kesin değil)' });
  expect(tek.notlar).toEqual([]);
  // Çok fark: yalnız not; hata veren istekteki boşluk zorunluluk hesabına katılmaz (yalnız başarılı örnek → zayıf "zorunlu olabilir").
  const cok = analiz([
    { ad: 'Tamam', durum: 'basarili', govde: zarf('<Kanal>7</Kanal><Not>n</Not><Bayrak>b</Bayrak>') },
    { ad: 'Eksik', durum: 'hata', govde: zarf('<Kanal>7</Kanal>') }
  ]);
  expect(cok.notlar).toEqual(['Hata veren \'Eksik\' isteği başarılı \'Tamam\' isteğinden 2 alanla ayrılıyor (Not, Bayrak); zorunluluk kanıtı sayılmaz.']);
  expect(bul(cok.oneriler, 'zorunlu', 'Girdi/Not')).toMatchObject({ guc: 'zayif', baslik: 'Zorunlu olabilir', kanit: '1/1 örnekte dolu; zorunlu olabilir (kesinleşmesi için WSDL ya da canlı doğrulama)' });
  // Hata veren istekte boş alan tek başına bir şey kanıtlamaz.
  const yalnizHata = analiz([{ ad: 'H', durum: 'hata', govde: zarf('<Kanal/>') }]);
  expect(yalnizHata.oneriler.filter((o) => o.tur === 'zorunlu' || o.tur === 'bosGonder')).toEqual([]);
  expect(gucluOneriler(cok.oneriler).every((o) => o.guc === 'guclu' && o.tur !== 'celiski')).toBe(true);
});

test('tip: WSDL tipi önce (string → metin, rakamlı değerde tamsayı yok); WSDL\'de olmayan alanda ≥ 3 gözlemle; desen / değer kısıtı önerilmez', () => {
  expect(tipCikar(['10.05.1983', '01.02.2020'])).toEqual({ tip: 'tarih', bicim: 'dd.MM.yyyy' });
  expect(tipCikar(['2024-01-02T03:04:05', '2024-01-02T03:04:05.120+03:00'])).toEqual({ tip: 'tarihSaat', bicim: "yyyy-MM-dd'T'HH:mm:ss" });
  expect(tipCikar(['12', '-3'])).toEqual({ tip: 'tamsayi' });
  expect(tipCikar(['12,50', '3'])).toEqual({ tip: 'ondalik', bicim: 'ayrac:,' });
  expect(tipCikar(['true', 'False'])).toEqual({ tip: 'mantiksal', bicim: 'true/false' });
  expect(tipCikar(['E', 'H', 'E'])).toEqual({ tip: 'mantiksal', bicim: 'E/H' });
  expect(tipCikar(['E'])).toBeNull();
  expect(tipCikar(['1', '0'])).toEqual({ tip: 'mantiksal', bicim: '1/0' });
  expect(tipCikar(['ad@ornek.test'])).toEqual({ tip: 'metin', bicim: 'e-posta' });
  expect(tipCikar(['00123', '00456'])).toBeNull();
  expect(tipCikar(['10000000146'])).toBeNull();
  expect(tipCikar(['${Tablo.Sutun}', '••••••'])).toBeNull();

  const uc = [['51234', '11220001', '10.05.1983', '5'], ['51234', '11220002', '11.06.1990', '15'], ['67890', '11220003', '12.07.1991', '7']];
  const r = analiz(uc.map(([k, kod, t, m]) => ({ govde: zarf(`<Kanal>${k}</Kanal><Kod>${kod}</Kod><Tarih>${t}</Tarih><Miktar>${m}</Miktar>`) })));
  // WSDL string: rakamlardan oluşsa da tip önerilmez (metin kalır); uzunluk / desen önerisi hiç yok.
  expect(bul(r.oneriler, 'tip', 'Girdi/Kanal')).toBeUndefined();
  expect(bul(r.oneriler, 'tip', 'Girdi/Kod')).toBeUndefined();
  expect(r.oneriler.some((o) => (o.tur as string) === 'desen' || (o.tur as string) === 'degerler')).toBe(false);
  // WSDL'de olmayan alanda değerlerden (3 gözlem).
  expect(bul(r.oneriler, 'tip', 'Girdi/Tarih')).toMatchObject({ baslik: 'Tip: tarih (gg.aa.yyyy)', guc: 'guclu' });
  expect(bul(r.oneriler, 'tip', 'Girdi/Miktar')?.deger).toEqual({ tip: 'tamsayi' });
  expect(bul(r.oneriler, 'alanEkle', 'Girdi/Miktar')?.deger).toEqual({ tip: 'tamsayi' });
  // 2 gözlem → tip önerisi yok.
  const iki = analiz(uc.slice(0, 2).map(([, , t]) => ({ govde: zarf(`<Tarih>${t}</Tarih>`) })));
  expect(bul(iki.oneriler, 'tip', 'Girdi/Tarih')).toBeUndefined();
  expect(bul(iki.oneriler, 'alanEkle', 'Girdi/Tarih')?.deger).toEqual({ tip: 'metin' });
});

test('gizli önerisi; gruba girmeyen her alana kendi tablosu (her farklı değer bir satır, eşik yok), evet/hayır alanına tablo yok', () => {
  const sema: OperasyonSemasi = { ad: 'Islem', kok: 'Islem', ns: '', alanlar: [{ ad: 'Girdi', cocuklar: [
    { ad: 'Parola', tip: 'metin' }, { ad: 'Numara', tip: 'metin' }, { ad: 'KimlikNo', tip: 'metin' }, { ad: 'Secenek', tip: 'metin' }, { ad: 'Liste', tip: 'metin', secenekler: ['P', 'R'] }
  ] }] };
  const satirlar = [['1', 'gizli-1', '10000000146', 'x1', 'true', 'P'], ['2', 'gizli-2', '10000000147', 'x2', 'false', 'P'], ['3', 'gizli-1', '10000000146', 'x1', 'true', 'R'],
    ['4', 'gizli-3', '10000000148', 'x3', 'false', 'R'], ['1', 'gizli-4', '10000000149', 'x4', 'true', 'P']];
  const r = servisAnalizi({ metot: 'Islem', sema, ornekler: satirlar.map(([b, p, n, k, s, l]) => ({
    govde: zarf(`<Baski>${b}</Baski><Parola>${p}</Parola><Numara>${n}</Numara><KimlikNo>${k}</KimlikNo><Secenek>${s}</Secenek><Liste>${l}</Liste>`) })) });
  expect(r.yeniTablolar.map((t) => [t.ad, t.sutunlar.map((c) => [c.ad, c.gizli]), t.satirlar.map((x) => x.degerler[t.sutunlar[0].ad])])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'tr'))).toEqual([
    ['Baski', [['Baski', false]], ['1', '2', '3', '4']], ['Giriş bilgileri', [['Parola', true]], [null, null, null, null, null]],
    ['Kişi bilgileri', [['KimlikNo', true]], [null, null, null, null, null]], ['Liste', [['Liste', false]], ['P', 'R']], ['Numara', [['Numara', true]], []]]);
  // Evet/hayır (Secenek: true / false) için tablo açılmaz.
  expect(r.yeniTablolar.flatMap((t) => t.sutunlar.map((c) => c.ad))).not.toContain('Secenek');
  // Tek değerli alan da tablo alır (eşik yok).
  const tekDeger = servisAnalizi({ metot: 'Islem', sema: null, ornekler: [{ govde: zarf('<Baski>1</Baski>') }] });
  expect(tekDeger.yeniTablolar.map((t) => [t.ad, t.tur, t.satirlar.map((x) => x.ad)])).toEqual([['Baski', 'liste', ['1']]]);
  expect(bul(r.oneriler, 'gizli', 'Girdi/Parola')).toMatchObject({ kanit: 'adı gizli ad kuralına uyuyor', guc: 'guclu' });
  expect(bul(r.oneriler, 'gizli', 'Girdi/Numara')).toMatchObject({ kanit: '11 haneli sayı (kimlik benzeri)', guc: 'guclu' });
  expect(bul(r.oneriler, 'gizli', 'Girdi/KimlikNo')?.kanit).toBe('adı kimlik numarası benzeri');
  expect(JSON.stringify(r.oneriler)).not.toContain('gizli-1');
  expect(JSON.stringify(r.oneriler)).not.toContain('10000000146');
});

test('tablo eşleştirme: ad + değer güçlü; yalnız değerden (desen aynı) zayıf; aynı satırda birlikte → güçlü; kopuk bağ; tabloya değer ekle (hata örneği hariç)', () => {
  const tablolar = [
    { id: 't1', ad: 'Ülke', sutunlar: [{ ad: 'Kod' }, { ad: 'Ad', karsiliklar: { 'Türkiye': { servis: 'TR' }, 'Almanya': { servis: 'DE' } } }],
      satirlar: [{ degerler: { Kod: 'TR', Ad: 'Türkiye' } }, { degerler: { Kod: 'DE', Ad: 'Almanya' } }] },
    { id: 't2', ad: 'Bayi', sutunlar: [{ ad: 'Bayi kodu' }, { ad: 'Kullanıcı' }],
      satirlar: [{ degerler: { 'Bayi kodu': '51234', 'Kullanıcı': '51234001' } }, { degerler: { 'Bayi kodu': '67890', 'Kullanıcı': '67890001' } }] },
    { id: 't3', ad: 'Diğer', sutunlar: [{ ad: 'Code' }], satirlar: [{ degerler: { Code: 'ZZ' } }] }
  ];
  expect(adEslesmesi('Country', 'Ülke')).toBe('esAnlam');
  expect(adEslesmesi('Username', 'Kullanıcı')).toBe('esAnlam');
  expect(adEslesmesi('TelNo', 'Telefon')).toBe('esAnlam');
  expect(bulunmaEki('Kod')).toBe('\'da');
  expect(bulunmaEki('Bayi kodu')).toBe('\'nda');
  expect(tabloEslesmesi('Country', ['TR', 'DE'], tablolar)).toMatchObject({ tabloId: 't1', sutun: 'Kod', guc: 'guclu', kanit: 'Ad: Country ↔ Ülke tablosu (eş anlam) · TR, DE 2/2 Ülke.Kod\'da var' });
  expect(tabloEslesmesi('Ad', ['TR', 'DE'], [tablolar[0]])?.kanit).toContain('TR ↔ Türkiye (karşılık)');
  expect(tabloEslesmesi('Username', ['51234001', '99999001'], tablolar)).toMatchObject({ tabloId: 't2', sutun: 'Kullanıcı', guc: 'guclu' });
  expect(tabloEslesmesi('Channel', ['51234'], tablolar)).toMatchObject({ sutun: 'Bayi kodu', guc: 'zayif', kanit: 'Yalnız değerden (ad eşleşmiyor) · 51234 1/1 Bayi.Bayi kodu\'nda var · desen aynı' });
  expect(tabloEslesmesi('Code', ['TR'], [tablolar[2]])).toBeNull();

  const sema: OperasyonSemasi = { ad: 'Islem', kok: 'Islem', ns: '', alanlar: [{ ad: 'Girdi', cocuklar: [{ ad: 'Channel', tip: 'metin' }, { ad: 'Username', tip: 'metin' }, { ad: 'Country', tip: 'metin' }] }] };
  const ornekler = [{ govde: zarf('<Channel>51234</Channel><Username>51234001</Username><Country>TR</Country>') }, { govde: zarf('<Channel>51234</Channel><Username>51234001</Username><Country>DE</Country>') }];
  const r = servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar });
  expect(bul(r.oneriler, 'tabloBagi', 'Girdi/Channel')).toMatchObject({ deger: { tablo: 't2', sutun: 'Bayi kodu' }, guc: 'guclu' });
  expect(bul(r.oneriler, 'tabloBagi', 'Girdi/Channel')?.kanit).toContain('Channel + Username aynı Bayi satırında (2 örnek)');
  // Ortak alan zaten bağlıysa da (Username → Bayi) aynı satır güveni sürer.
  const bagli = servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar, mevcut: { baglar: { 'Girdi/Username': { tablo: 't2', sutun: 'Kullanıcı' } } } });
  expect(bul(bagli.oneriler, 'tabloBagi', 'Girdi/Channel')?.guc).toBe('guclu');
  expect(bul(servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar, mevcut: { baglar: { 'Girdi/Country': { tablo: 't3', sutun: 'Code' } } } }).oneriler, 'tabloBagi', 'Girdi/Country')?.kanit)
    .toContain('şu anki bağ: 0/2 Diğer.Code\'nde var');
  // Kopuk bağ: TEK öneri; güç eşleşme kanıtından (ad + değer → güçlü; kopukluk gücü düşürmez). "Bağı kaldır" aynı öneriyle (deger null).
  const kopuk = servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar, mevcut: { baglar: { 'Girdi/Username': { tablo: 'silinmis', sutun: 'Eski' } } } });
  const kb = hepsi(kopuk.oneriler, 'kopukBag', 'Girdi/Username');
  expect(kb.map((o) => [o.baslik, o.guc, o.deger, o.eskiBag])).toEqual([
    ['Eski bağ silinmiş (silinmiş tablo › Eski) → Bayi › Kullanıcı', 'guclu', { tablo: 't2', sutun: 'Kullanıcı' }, 'silinmiş tablo › Eski']]);
  expect(gucluOneriler(kopuk.oneriler).some((o) => o.tur === 'kopukBag')).toBe(true);
  const d = bosDurum({ baglar: { 'Girdi/Username': { tablo: 'silinmis', sutun: 'Eski' } } });
  oneriyiUygula(d, { ...kb[0], deger: null });
  expect(d.baglar['Girdi/Username']).toBeUndefined();
  oneriyiUygula(d, kb[0]);
  expect(d.baglar['Girdi/Username']).toEqual({ tablo: 't2', sutun: 'Kullanıcı' });
  // Eşleşme yoksa yalnız "bağı kaldır" (zayıf; güçlü önerileri uygula kapsamaz).
  const yalniz = servisAnalizi({ metot: 'Islem', sema, ornekler, tablolar: [], mevcut: { baglar: { 'Girdi/Username': { tablo: 'silinmis', sutun: 'Eski' } } } });
  expect(hepsi(yalniz.oneriler, 'kopukBag', 'Girdi/Username').map((o) => [o.baslik, o.guc, o.deger])).toEqual([['Eski bağ silinmiş (silinmiş tablo › Eski) → bağı kaldır', 'zayif', null]]);
  expect(gucluOneriler(yalniz.oneriler).some((o) => o.tur === 'kopukBag')).toBe(false);
  // Bağlı tabloda olmayan değerler: "tabloya şu değerler eklensin mi" (hata veren örneğin değeri girmez).
  const eksik = servisAnalizi({ metot: 'Islem', sema, tablolar, mevcut: { baglar: { 'Girdi/Channel': { tablo: 't2', sutun: 'Bayi kodu' } } }, ornekler: [
    { govde: zarf('<Channel>51234</Channel>') }, { govde: zarf('<Channel>33333</Channel>') }, { durum: 'basarili', govde: zarf('<Channel>44444</Channel>') },
    { durum: 'hata', govde: zarf('<Channel>99999</Channel>') }] });
  const td = bul(eksik.oneriler, 'tabloyaDeger', 'Girdi/Channel');
  expect(td).toMatchObject({ guc: 'zayif', deger: { tablo: 't2', sutun: 'Bayi kodu', degerler: ['33333', '44444'] }, baslik: 'Bayi › Bayi kodu tablosuna şu değerler eklensin mi: 33333, 44444' });
  const d2 = bosDurum();
  oneriyiUygula(d2, td as AnalizOnerisi);
  expect(d2.tabloDegerleri).toEqual([{ tablo: 't2', sutun: 'Bayi kodu', degerler: ['33333', '44444'] }]);
});

test('ad eşleşmesi: genel ekler (no / number / kod / tarih / ad / tip) ve rol önekleri tek başına eşleşmez; ayırt edici kavram eşleşmeli', () => {
  // Gerçek servislerde yanlış eşleşen alan adları (negatif): yalnız genel ek ortak.
  for (const a of ['IdentityNumber', 'PhoneNumber', 'PassportNumber', 'UnitNo', 'ContractNo', 'ClientPhoneNumber', 'ClientIdentityNumber']) expect(adEslesmesi(a, 'Vergi no'), a).toBeNull();
  for (const a of ['TaxNumber', 'CardNumber', 'RenewalNo']) expect(adEslesmesi(a, 'Sözleşme no'), a).toBeNull();
  for (const [a, b] of [['Code', 'Kod'], ['Name', 'Ad'], ['ClientType', 'Tip'], ['StartDate', 'Tarih'], ['Value', 'Değer']]) expect(adEslesmesi(a, b), a + ' / ' + b).toBeNull();
  // Ayırt edici kavram eşleşir (TR ↔ EN, Türkçe ek, bitişik sözcük; önek bağlamdır); uzun sözcükte tek harf farkı benzer sayılır.
  for (const [a, b] of [['IdentityNumber', 'Kimlik no'], ['ClientIdentityNumber', 'TC'], ['TaxNumber', 'Vergi no'], ['PhoneNumber', 'Telefon'],
    ['ClientPhoneNumber', 'İletişim telefonu'], ['PassportNumber', 'Pasaport no'], ['CardNumber', 'Kart no'], ['CustomerBirthDate', 'Doğum tarihi'],
    ['ContractNr', 'Contracts no'], ['FirstName', 'Ad'], ['TelNo', 'cepTelefonu'], ['Month', 'Ay'], ['Installment', 'Taksit Sayısı']]) expect(adEslesmesi(a, b), a + ' / ' + b).not.toBeNull();
  // Kapsama: alanın kavramlarından kaçı hedefte; ana kavram (son ayırt edici) ağır basar.
  expect(adPuani('CardNumber', 'Kart numarası', 'Kart bilgileri').puan).toBeGreaterThan(adPuani('CardNumber', 'Kart üzerindeki isim', 'Kart bilgileri').puan);
  expect(adEslesmesi('CardHolderLastname', 'Kart no')).toBeNull();
  // Bağlam: ceza (yasak değil). Kart alanı kişi / pasaport tablosunda zayıflar; yalnız hedefte bağlam hafif ceza.
  expect(baglamUyumlu('CardHolderLastname', 'Pasaportlu kişi', 'Soyad')).toBe(false);
  expect(baglamUyumlu('CardHolderLastname', 'Kart bilgileri', 'Soyad')).toBe(true);
  expect(adPuani('CardHolderLastname', 'Soyad', 'Pasaportlu kişi').puan).toBeLessThan(AD_ESIGI);
  expect(adPuani('CardHolderLastname', 'Kart üzerindeki soyisim', 'Kart bilgileri').puan).toBeGreaterThan(0.85);
  expect(adPuani('Month', 'Son kullanma ay', 'Kredi kartı').puan).toBeGreaterThanOrEqual(AD_ESIGI);
  const tablolar = [
    { id: 'p', ad: 'Pasaportlu kişi', sutunlar: [{ ad: 'Soyad' }, { ad: 'D TARİHİ' }], satirlar: [{ degerler: { Soyad: 'Yilmaz', 'D TARİHİ': '01.01.1990' } }] },
    { id: 'k', ad: 'Kişi bilgileri', sutunlar: [{ ad: 'Vergi no' }, { ad: 'Sözleşme no' }], satirlar: [{ degerler: { 'Vergi no': '1111111111', 'Sözleşme no': 'S1' } }] }
  ];
  expect(tabloEslesmesi('CardHolderLastname', ['Yilmaz'], tablolar)).toBeNull();
  expect(tabloEslesmesi('PhoneNumber', ['5550001'], tablolar)).toBeNull();
  // Doğum tarihi yalnız pasaport tablosunda: öneri var ama zayıf (bağlam cezası; değer örtüşse de).
  expect(tabloEslesmesi('CustomerBirthDate', ['01.01.1990'], tablolar)).toMatchObject({ tabloId: 'p', sutun: 'D TARİHİ', guc: 'zayif' });
  const r = servisAnalizi({ metot: 'Islem', sema: null, tablolar, ornekler: [{ ad: 'A', govde: zarf('<CardHolderLastname>Yilmaz</CardHolderLastname><RenewalNo>3</RenewalNo>') }] });
  expect(r.oneriler.filter((o) => o.tur === 'tabloBagi')).toEqual([]);
  expect(r.yeniTablolar.flatMap((x) => x.alanlar.map((a) => a.yol)).sort()).toEqual(['Girdi/CardHolderLastname', 'Girdi/RenewalNo']);
});

test('en uygun sütun: her alan için mevcut tablolardaki en uygun sütun (kavram düzeyinde; TR ↔ EN); önceki yanlışlar dönmez', () => {
  const T = (id: string, ad: string, sutunlar: string[], gizli: string[] = []) => ({ id, ad, sutunlar: sutunlar.map((c) => ({ ad: c, gizli: gizli.includes(c) })), satirlar: [] });
  const tablolar = [
    T('kisi', 'Kişi bilgileri', ['Ad', 'Soyad', 'Telefon', 'Doğum tarihi', 'Vergi no', 'Kimlik no']),
    T('pas', 'Pasaportlu kişi', ['Ad', 'Soyad', 'Pasaport no', 'D TARİHİ']),
    T('kart', 'Kart bilgileri', ['Kart numarası', 'Kart üzerindeki isim', 'Kart üzerindeki soyisim']),
    T('kk', 'Kredi kartı', ['CVV', 'Son kullanma ay', 'Son kullanma yıl', 'Taksit Sayısı'], ['CVV']),
    T('soz', 'Sözleşme', ['Sözleşme no'])
  ];
  const en = (ad: string, gizli = false) => { const e = tabloEslesmesi(ad, [], tablolar, gizli); return e ? `${e.tablo} › ${e.sutun}` : null; };
  // Kaçan doğru eşleşmeler (gerçek parametre adları).
  expect(en('PhoneNumber')).toBe('Kişi bilgileri › Telefon');
  expect(en('ClientPhoneNumber')).toBe('Kişi bilgileri › Telefon');
  expect(en('BirthDate')).toBe('Kişi bilgileri › Doğum tarihi');
  expect(en('Birthday')).toBe('Kişi bilgileri › Doğum tarihi');
  expect(en('PassportNumber')).toBe('Pasaportlu kişi › Pasaport no');
  expect(en('CardHolderFirstname')).toBe('Kart bilgileri › Kart üzerindeki isim');
  expect(en('CardHolderLastname')).toBe('Kart bilgileri › Kart üzerindeki soyisim');
  expect(en('CVV', true)).toBe('Kredi kartı › CVV');
  expect(en('Month')).toBe('Kredi kartı › Son kullanma ay');
  expect(en('Year')).toBe('Kredi kartı › Son kullanma yıl');
  expect(en('Installment')).toBe('Kredi kartı › Taksit Sayısı');
  // Yanlış öneri düzeldi: kart numarası, kartın üzerindeki isim değil (ikinci aday kanıtta görünür).
  expect(en('CardNumber')).toBe('Kart bilgileri › Kart numarası');
  expect(tabloEslesmesi('CardNumber', [], tablolar)?.kanit).toContain('diğer aday: Kart bilgileri › Kart üzerindeki isim');
  // Önceki yanlışlar dönmez: yalnız "no" ortak.
  for (const a of ['PhoneNumber', 'PassportNumber', 'UnitNo']) expect(en(a), a).not.toBe('Kişi bilgileri › Vergi no');
  expect(en('UnitNo')).toBeNull();
  expect(en('CardNumber')).not.toBe('Sözleşme › Sözleşme no');
  expect(en('RenewalNo')).toBeNull();
  // Güç: ad + değer → güçlü; yalnız ad → zayıf.
  const dolu = [{ ...T('kisi', 'Kişi bilgileri', ['Telefon']), satirlar: [{ degerler: { Telefon: '5550001' } }] }];
  expect(tabloEslesmesi('PhoneNumber', ['5550001'], dolu)?.guc).toBe('guclu');
  expect(tabloEslesmesi('PhoneNumber', ['5559999'], dolu)?.guc).toBe('zayif');
  // Kopuk bağın silinmiş sütun adı ek ad kanıtıdır.
  expect(tabloEslesmesi('Contact', [], dolu, false, ['cepTelefonu'])).toMatchObject({ sutun: 'Telefon', kanit: 'Ad: cepTelefonu (eski sütun adı) ↔ Telefon (eş anlam)' });
  // Kopuk bağlı alanlar da aynı en-uygun-sütun aramasından geçer.
  const k = servisAnalizi({ metot: 'Islem', sema: null, tablolar, ornekler: [{ ad: 'A', govde: zarf('<PhoneNumber>5550001</PhoneNumber><CardNumber>4111</CardNumber>') }],
    mevcut: { baglar: { 'Girdi/PhoneNumber': { tablo: 'silinmis', sutun: 'cepTelefonu' }, 'Girdi/CardNumber': { tablo: 'silinmis', sutun: 'kartNo' } } } });
  expect(k.oneriler.filter((o) => o.tur === 'kopukBag').map((o) => [o.yol, o.deger])).toEqual([
    ['Girdi/PhoneNumber', { tablo: 'kisi', sutun: 'Telefon' }], ['Girdi/CardNumber', { tablo: 'kart', sutun: 'Kart numarası' }]]);
});

test('örnekler arası fark, alan listesi olmayan metot; yeni tablolar kavram gruplarına ayrılır; hata veren örneğin değerleri tabloya girmez', () => {
  const r = analiz([
    { ad: 'Bireysel', govde: zarf('<Kanal>7</Kanal><Kod>K1</Kod>') },
    { ad: 'Kurumsal', govde: zarf('<Kanal>7</Kanal><Not>n</Not>') }
  ], { ekKanitlar: [{ ad: 'Senaryo', govde: zarf('<Kanal>${Tablo.Kanal}</Kanal>') }] });
  expect(r.toplam).toBe(3);
  expect(r.farklar.map((f) => f.metin)).toEqual([
    'Kod: Bireysel örneğinde dolu, Kurumsal örneğinde boş / yok → Bireysel senaryosunda istenir',
    'Not: Kurumsal örneğinde dolu, Bireysel örneğinde boş / yok → Kurumsal senaryosunda istenir'
  ]);
  const bos = servisAnalizi({ metot: 'Islem', sema: null, ornekler: [{ ad: 'A', govde: zarf('<Kanal>7</Kanal><Grup><Ic>1</Ic></Grup>') }] });
  expect(bos.kok).toBe('Islem');
  expect(bos.ns).toBe('urn:ornek');
  expect(bos.oneriler.filter((o) => o.tur === 'alanEkle').map((o) => [o.yol, o.guc])).toEqual([['Girdi/Kanal', 'zayif'], ['Girdi/Grup/Ic', 'zayif']]);

  expect(kavramGrubu('BirthDate')).toBe('Kişi bilgileri');
  expect(kavramGrubu('CityName')).toBe('Adres bilgileri');
  expect(kavramGrubu('MobilePhone')).toBe('İletişim bilgileri');
  expect(kavramGrubu('Miktar')).toBeNull();
  const g = servisAnalizi({ metot: 'Islem', sema: null, ornekler: [
    { ad: 'Bir', govde: zarf('<FirstName>Ali</FirstName><City>Ankara</City><Phone>5550001</Phone><Miktar>3</Miktar>') },
    { ad: 'Iki', govde: zarf('<FirstName>Can</FirstName><City>Izmir</City><Phone>5550002</Phone><Miktar>4</Miktar>') },
    { ad: 'Hatali', durum: 'hata', govde: zarf('<FirstName>Ece</FirstName><City>Bursa</City><Miktar>99</Miktar>') }] });
  expect(g.yeniTablolar.map((t) => [t.ad, t.sutunlar.map((c) => c.ad), t.satirlar.map((x) => x.ad)])).toEqual([
    ['Kişi bilgileri', ['FirstName'], ['Bir', 'Iki']], ['Adres bilgileri', ['City'], ['Bir', 'Iki']], ['İletişim bilgileri', ['Phone'], ['Bir', 'Iki']], ['Miktar', ['Miktar'], ['3', '4']]]);
  expect(JSON.stringify(g.yeniTablolar)).not.toContain('Bursa');
  expect(g.oneriler.filter((o) => o.tur === 'yeniTablo').every((o) => o.guc === 'zayif')).toBe(true);
  const tek = servisAnalizi({ metot: 'Islem', sema: null, ornekler: [{ ad: 'Bir', govde: zarf('<FirstName>Ali</FirstName>') }] });
  expect(tek.yeniTablolar.map((t) => t.ad)).toEqual(['Islem']);
  // Kayıt tablosunda örnek satırlarında olmayan farklı değer (ek kanıttan) eksik kalmaz.
  const kanit = servisAnalizi({ metot: 'Islem', sema: null, ornekler: [{ ad: 'Bir', govde: zarf('<City>Ankara</City>') }], ekKanitlar: [{ govde: zarf('<City>Izmir</City>') }] });
  expect(kanit.yeniTablolar[0].satirlar.map((x) => [x.ad, x.degerler.City])).toEqual([['Bir', 'Ankara'], ['Izmir', 'Izmir']]);
});

test('uygula / yoksay: karar hatırlanır; yeni örnek yalnız yeni öneri getirir; güçlü önerileri uygula yalnız güçlüleri kapsar', () => {
  const ornekler: Ornek[] = [
    { ad: 'A', durum: 'basarili', govde: zarf('<Kanal>71</Kanal><Not/><Ek>x1</Ek><Tur>O</Tur>') },
    { ad: 'B', durum: 'basarili', govde: zarf('<Kanal>8</Kanal><Not/><Ek>x2</Ek><Tur>O</Tur>') },
    { ad: 'C', govde: zarf('<Kanal>9</Kanal><Not/><Ek>x3</Ek><Tur>T</Tur>') }];
  const tablolar = [{ id: 'm1', ad: 'Islem', sutunlar: [{ ad: 'Eski' }], satirlar: [] }];
  const d = bosDurum();
  const calistir = (l = ornekler) => servisAnalizi({ metot: 'Islem', sema: SEMA, ornekler: l, tablolar, ekler: d.ekler,
    mevcut: { zorunlu: [...d.zorunlu], baglar: d.baglar, varsayilanlar: d.varsayilanlar, kurallar: d.kurallar, kararlar: d.kararlar } });
  const r = calistir();
  expect(r.yeniTablolar.map((t) => [t.ad, t.tur, t.sutunlar.map((c) => c.ad), t.satirlar.length])).toEqual([
    ['Giriş bilgileri', 'kayit', ['Kanal'], 3], ['Ek', 'liste', ['Ek'], 3], ['Tur', 'liste', ['Tur'], 2]]);
  const guclu = gucluOneriler(r.oneriler);
  expect(guclu.map((o) => `${o.tur} ${o.yol}`).sort()).toEqual(['alanEkle Girdi/Ek', 'alanEkle Girdi/Tur', 'bosGonder Girdi/Not'].sort());
  for (const o of guclu) oneriyiUygula(d, o);
  expect(d.varsayilanlar).toEqual({ 'Girdi/Not': { kaynak: 'bos' } });
  expect(d.ekler).toEqual([{ yol: 'Girdi/Ek', tip: 'metin' }, { yol: 'Girdi/Tur', tip: 'metin' }]);
  expect(d.kurallar['Girdi/Kanal']).toBeUndefined();
  const zayif = calistir().oneriler.filter((o) => o.guc === 'zayif');
  expect(zayif.map((o) => `${o.tur} ${o.yol}`).sort()).toEqual(['yeniTablo ', 'yeniTablo ', 'yeniTablo ', 'zorunlu Girdi/Ek', 'zorunlu Girdi/Kanal', 'zorunlu Girdi/Tur'].sort());
  // Kullanıcı Kanal için zayıf "zorunlu olabilir" önerisini uygular; diğer zayıfları yoksayar (yeni tablolar uygulanır).
  for (const o of zayif) (o.tur === 'yeniTablo' || o.yol === 'Girdi/Kanal' ? oneriyiUygula : oneriyiYoksay)(d, o);
  expect(d.baglar['Girdi/Tur']).toEqual({ tablo: 'yeni:Tur', sutun: 'Tur' });
  expect(calistir().oneriler).toEqual([]);
  // Yeni başarılı örnekte Kanal yok → yalnız yeni (güçlü) "isteğe bağlı" önerisi.
  const sonra = calistir([...ornekler, { ad: 'D', durum: 'basarili', govde: zarf('<Not/><Ek>x5</Ek><Tur>T</Tur>') }]);
  expect(sonra.oneriler.map((o) => `${o.tur} ${o.yol} ${o.guc}`)).toEqual(['zorunlu Girdi/Kanal guclu']);
});

test('örnek isteklerin kaydı: maskeli gizli değer geri yazılır; durum (başarılı / hata) saklanır; içe aktarılan örnek tekrar eklenmez', () => {
  const asil = { id: 'o1', ad: 'A', govde: '<Islem><Parola>asil-deger</Parola><Kanal>7</Kanal></Islem>', kaynak: 'elle' };
  const gorunum = ornekleriMaskele({ ornekIstekler: { Islem: [asil] } }, []);
  expect(gorunum.ornekIstekler?.Islem[0].govde).toBe('<Islem><Parola>••••••</Parola><Kanal>7</Kanal></Islem>');
  const kayit = ornekIstekleriniDogrula({ Islem: [{ ...gorunum.ornekIstekler?.Islem[0], durum: 'hata', govde: '<Islem><Parola>••••••</Parola><Kanal>8</Kanal></Islem>' },
    { ad: '', govde: '<Islem/>', durum: 'gecersiz' }, { govde: '  ' }] }, { Islem: [asil] }, []);
  expect(kayit.Islem[0]).toEqual({ id: 'o1', ad: 'A', govde: '<Islem><Parola>asil-deger</Parola><Kanal>8</Kanal></Islem>', kaynak: 'elle', durum: 'hata' });
  expect(kayit.Islem[1]).toMatchObject({ ad: 'Örnek 2', govde: '<Islem/>', kaynak: 'elle' });
  expect(kayit.Islem[1].durum).toBeUndefined();
  expect(kayit.Islem).toHaveLength(2);
  expect(() => ornekIstekleriniDogrula({ Islem: 'x' }, undefined, [])).toThrow(/dizi/);
  const eklendi = ornekleriEkle({ Islem: [asil] }, 'Islem', [{ ad: 'Dosyadan', govde: asil.govde, kaynak: 'soapui' }, { ad: 'Yeni', govde: '<Islem><Kanal>1</Kanal></Islem>', kaynak: 'soapui' }]);
  expect(eklendi.Islem.map((x) => [x.ad, x.kaynak])).toEqual([['A', 'elle'], ['Yeni', 'soapui']]);
});
