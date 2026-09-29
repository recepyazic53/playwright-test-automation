// KORUMA TESTLERİ — servis yanıtından kontrol üretme (servisler/yanit-kontrolleri.mjs) ve genişletilmiş kontrol modeli (servis-deposu.mjs
// doğrulaması + soap-istemcisi.mjs değerlendirmesi): yanıt ağacı (XML sıralı kardeşler, JSON diziler), her işleç (eşittir, içerir, var, yok,
// desen, sayısal aralık), işleç önerisi, gizli / maskeli alanda değer yazılmaması, altın yanıt (yok sayılan alanlar, eklenen / kaldırılan /
// değişen), yanıt süresi (SLA) ve eski "eşit" kontrollerinin aynen çalışması. Ağ yok; değerler SAHTEDİR.
import { expect, test } from '@playwright/test';
import {
  altinYanitKarsilastir, altinYanitOlustur, degiskenMi, kontrolOnerisi, sayiOku, yanitAlaniDegerlendir, yanitAlaniOku, yanitAlanlari, yanitSuresiDegerlendir
} from '../../scripts/platform/servisler/yanit-kontrolleri.mjs';
import { kontrolleriDegerlendir } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { senaryoIceriginiDogrula, type ServisKontrolu } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { gizliAdMi } from '../../scripts/platform/ayarlar/gizli-adlar.mjs';
import { SAHTE_TOKEN, faultYaniti, siparisYaniti } from './servis-onerileri-fikstur';

const XML = siparisYaniti('A-1');
const K = '/Envelope/Body/SiparisVerResponse/Sonuc';
const JSON_YANIT = JSON.stringify({ veri: { no: 70012345, tutar: 12.5, etiketler: ['a', 'b'], sahip: null, parola: 'p-123', kalemler: [{ kod: 'K1' }, { kod: 'K2' }] } });
const gizliMi = (ad: string) => gizliAdMi(ad);

test.describe('yanıt ağacı', () => {
  test('XML: yaprak yollar (önekler atılır, tekrar eden kardeşlerde sıra), değer biçimi', () => {
    const y = yanitAlanlari(XML);
    expect(y.bicim).toBe('xml');
    const m = new Map(y.alanlar.map((a) => [a.yol, a]));
    expect(m.get(`${K}/Durum`)).toMatchObject({ ad: 'Durum', deger: 'BASARILI', bicim: 'metin' });
    expect(m.get(`${K}/SiparisNo`)).toMatchObject({ bicim: 'numara' });
    expect(m.get(`${K}/Tutar`)).toMatchObject({ bicim: 'sayi' });
    expect(m.get(`${K}/Tarih`)).toMatchObject({ bicim: 'tarih' });
    expect([...m.keys()]).toContain(`${K}/Kalemler/Kalem[2]/Kod`);
    expect(yanitAlaniOku(XML, 'xml', `${K}/Kalemler/Kalem[2]/Kod`)).toEqual({ bulundu: true, deger: 'K2' });
    expect(yanitAlaniOku(XML, 'xml', '/soap:Envelope/soap:Body/SiparisVerResponse/Sonuc/Durum')).toEqual({ bulundu: true, deger: 'BASARILI' });
    expect(yanitAlaniOku(XML, 'xml', `${K}/Yok`)).toEqual({ bulundu: false, deger: null });
  });

  test('JSON: yollar (a.b[0].c), null, maskeli değer', () => {
    const y = yanitAlanlari(JSON_YANIT);
    expect(y.bicim).toBe('json');
    expect(y.alanlar.map((a) => a.yol)).toEqual(['veri.no', 'veri.tutar', 'veri.etiketler[0]', 'veri.etiketler[1]', 'veri.sahip', 'veri.parola', 'veri.kalemler[0].kod', 'veri.kalemler[1].kod']);
    expect(yanitAlaniOku(JSON_YANIT, 'json', 'veri.kalemler[1].kod')).toEqual({ bulundu: true, deger: 'K2' });
    expect(yanitAlaniOku(JSON_YANIT, 'json', 'veri.sahip')).toEqual({ bulundu: true, deger: null });
    expect(yanitAlanlari('{"a":"***"}').alanlar[0]).toMatchObject({ maskeli: true });
    expect(yanitAlanlari('düz metin').bicim).toBeNull();
    expect(sayiOku('1.245,50')).toBe(1245.5);
    expect(sayiOku('1245.50')).toBe(1245.5);
  });
});

test.describe('işleçler', () => {
  const d = (k: Record<string, unknown>) => yanitAlaniDegerlendir(XML, { kaynak: 'xml', ...k });
  test('eşittir, içerir, var, yok, desen, aralık: geçer / kalır', () => {
    expect(d({ yol: `${K}/Durum`, islec: 'esit', deger: 'BASARILI' })).toEqual({ gecti: true, aciklama: '"BASARILI"' });
    expect(d({ yol: `${K}/Durum`, islec: 'esit', deger: 'HATA' })).toEqual({ gecti: false, aciklama: 'Görülen: "BASARILI"' });
    expect(d({ yol: `${K}/Durum`, islec: 'icerir', deger: 'BASAR' }).gecti).toBe(true);
    expect(d({ yol: `${K}/Durum`, islec: 'icerir', deger: 'X' }).gecti).toBe(false);
    expect(d({ yol: `${K}/SiparisNo`, islec: 'var' })).toEqual({ gecti: true, aciklama: 'Alan var' });
    expect(d({ yol: `${K}/Yok`, islec: 'var' })).toEqual({ gecti: false, aciklama: 'Alan yanıtta yok' });
    expect(d({ yol: `${K}/Yok`, islec: 'yok' }).gecti).toBe(true);
    expect(d({ yol: `${K}/Durum`, islec: 'yok' }).gecti).toBe(false);
    expect(d({ yol: `${K}/SiparisNo`, islec: 'desen', deger: '\\d{8}' }).gecti).toBe(true);
    expect(d({ yol: `${K}/SiparisNo`, islec: 'desen', deger: '\\d{7}' })).toEqual({ gecti: false, aciklama: 'Desene uymuyor: "70012345"' });
    expect(d({ yol: `${K}/Tutar`, islec: 'aralik', enAz: 0, enCok: 100000 }).gecti).toBe(true);
    expect(d({ yol: `${K}/Tutar`, islec: 'aralik', enCok: 1000 })).toEqual({ gecti: false, aciklama: 'Aralık dışında: "1245.50"' });
    expect(d({ yol: `${K}/Durum`, islec: 'aralik', enAz: 0 }).gecti).toBe(false);
    expect(yanitAlaniDegerlendir(JSON_YANIT, { kaynak: 'json', yol: 'veri.tutar', islec: 'aralik', enAz: 12, enCok: 13 }).gecti).toBe(true);
  });

  test('gizli alandan gelen kontrolde açıklamaya değer yazılmaz', () => {
    const r = d({ yol: `${K}/Token`, islec: 'desen', deger: '\\d+', gizli: true });
    expect(r).toEqual({ gecti: false, aciklama: 'Desene uymuyor' });
    expect(JSON.stringify(d({ yol: `${K}/Token`, islec: 'aralik', enAz: 0, gizli: true }))).not.toContain(SAHTE_TOKEN);
  });
});

test.describe('işleç önerisi ve altın yanıt', () => {
  test('biçimden öneri: tarih → desen, 8 haneli numara → \\d{8}, sayı → aralık, metin → eşittir; gizli / maskeli → değer yok', () => {
    const m = new Map(yanitAlanlari(XML).alanlar.map((a) => [a.ad, a]));
    expect(kontrolOnerisi(m.get('Durum')!, gizliMi)).toMatchObject({ islec: 'esit', deger: 'BASARILI', gizli: false });
    expect(kontrolOnerisi(m.get('SiparisNo')!, gizliMi)).toMatchObject({ islec: 'desen', deger: '\\d{8}' });
    expect(kontrolOnerisi(m.get('Tarih')!, gizliMi)).toMatchObject({ islec: 'desen', deger: '\\d{4}-\\d{2}-\\d{2}' });
    expect(kontrolOnerisi(m.get('Tutar')!, gizliMi)).toMatchObject({ islec: 'aralik' });
    const token = kontrolOnerisi(m.get('Token')!, gizliMi);
    expect(token).toMatchObject({ islec: 'var', gizli: true });
    expect(JSON.stringify(token)).not.toContain(SAHTE_TOKEN);
    // Gizli adlı ama biçimi belli (numara): yalnız desen; maskeli: yalnız var.
    expect(kontrolOnerisi({ yol: '/a/PinKodu', ad: 'PinKodu', deger: '123456' }, gizliMi)).toMatchObject({ islec: 'desen', deger: '\\d{6}', gizli: true });
    expect(kontrolOnerisi({ yol: '/a/No', ad: 'No', deger: '***', maskeli: true }, gizliMi)).toMatchObject({ islec: 'var', gizli: true });
    expect(degiskenMi(m.get('Tarih')!)).toBe(true);
    expect(degiskenMi(m.get('Durum')!)).toBe(false);
  });

  test('altın yanıt: gizli değer saklanmaz; yok sayılan değişince geçer; eklenen / kaldırılan / değişen alan yol yol', () => {
    const tumu = yanitAlanlari(XML).alanlar.map((a) => a.yol);
    const k = altinYanitOlustur(XML, { karsilastir: tumu, yokSay: [`${K}/IslemNo`, `${K}/Tarih`], gizliMi });
    expect(k.bicim).toBe('xml');
    expect(JSON.stringify(k)).not.toContain(SAHTE_TOKEN);
    expect(k.alanlar.map((a) => a.yol)).not.toContain(`${K}/Token`);
    expect(k.yapi).toContain(`${K}/Token`);
    expect(k.yapi).toContain(`${K}/Kalemler/Kalem/Kod`);
    expect(altinYanitKarsilastir(siparisYaniti('B-99'), k)).toMatchObject({ gecti: true, farklar: [] });
    const degisen = siparisYaniti('C-1').replace('<Durum>BASARILI</Durum>', '<Durum>BEKLIYOR</Durum>').replace('<Tarih>2026-09-24</Tarih>', '<Tarih>2026-09-25</Tarih><Yeni>1</Yeni>')
      .replace('<Tutar>1245.50</Tutar>', '');
    const r = altinYanitKarsilastir(degisen, k);
    expect(r.gecti).toBe(false);
    expect(r.farklar).toEqual([{ tur: 'eklenen', yol: `${K}/Yeni` }, { tur: 'kaldirilan', yol: `${K}/Tutar` }, { tur: 'degisen', yol: `${K}/Durum` }]);
    expect(r.aciklama).toBe('1 eklenen, 1 kaldırılan, 1 değişen alan');
    // Değer açıklamaya yazılmaz.
    expect(JSON.stringify(r)).not.toContain('BEKLIYOR');
    // Tekrar eden öğenin sayısı değişse de yapı aynıysa (Kalem) fark yok.
    expect(altinYanitKarsilastir(siparisYaniti('D').replace('<Kalem><Kod>K2</Kod></Kalem>', ''), { ...k, alanlar: k.alanlar.filter((a) => !a.yol.includes('Kalem')) }).gecti).toBe(true);
  });

  test('yanıt süresi (SLA)', () => {
    expect(yanitSuresiDegerlendir(412, { deger: '2000' })).toEqual({ gecti: true, aciklama: '412 ms' });
    expect(yanitSuresiDegerlendir(2500, { deger: '2000' })).toEqual({ gecti: false, aciklama: '2500 ms (sınır 2000 ms)' });
    expect(yanitSuresiDegerlendir(undefined, { deger: '2000' }).gecti).toBe(false);
  });
});

test.describe('kontrol modeli (kayıt doğrulaması + koşuda değerlendirme)', () => {
  const kaydet = (kontroller: unknown[]) => senaryoIceriginiDogrula({ operasyon: 'SiparisVer', govde: '<x/>', kontroller }).kontroller;

  test('yeni türler doğrulanır ve koşuda değerlendirilir; altın yanıtta gizli adlı / maskeli değer saklanmaz', () => {
    const altin = altinYanitOlustur(XML, { karsilastir: yanitAlanlari(XML).alanlar.map((a) => a.yol), yokSay: [`${K}/IslemNo`] });
    // Arayüz gizli adı süzmese bile sunucu atar (değer saklanmaz; yapıda yolu kalır).
    const kontroller = kaydet([
      { tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Durum`, islec: 'esit', deger: 'BASARILI' },
      { tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Tutar`, islec: 'aralik', enAz: '0', enCok: 5000 },
      { tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Token`, islec: 'var', gizli: true, fazla: 'atılır' },
      altin,
      { tur: 'yanitSuresi', deger: '2000' },
      { tur: 'veya', alt: [{ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Durum`, islec: 'esit', deger: 'X' }, { tur: 'yanitSuresi', deger: '100' }] }
    ]) as ServisKontrolu[];
    expect(kontroller[1]).toEqual({ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Tutar`, islec: 'aralik', enAz: 0, enCok: 5000 });
    expect(kontroller[2]).toEqual({ tur: 'yanitAlani', kaynak: 'xml', yol: `${K}/Token`, islec: 'var', gizli: true });
    expect(JSON.stringify(kontroller[3])).not.toContain(SAHTE_TOKEN);
    const s = kontrolleriDegerlendir({ durumKodu: 200, govde: siparisYaniti('Z-9'), sureMs: 150 }, kontroller);
    expect(s.map((x) => [x.ad, x.gecti])).toEqual([
      [`${K}/Durum = "BASARILI"`, true], [`${K}/Tutar aralık 0 – 5000`, true], [`${K}/Token var`, true],
      ['Altın yanıtla karşılaştır (6 sabit alan, 1 yok sayılan)', true], ['Yanıt en çok 2000 ms', true], [expect.stringContaining('Şunlardan biri'), false]
    ]);
    const yavas = kontrolleriDegerlendir({ durumKodu: 500, govde: faultYaniti('Tutar limiti aşıldı'), sureMs: 3000 }, kontroller);
    // Fault yanıtında alan kontrolleri kalır (alan yok).
    expect(yavas.filter((x) => x.tur === 'yanitAlani').map((x) => [x.gecti, x.aciklama])).toEqual([[false, 'Alan yanıtta yok'], [false, 'Alan yanıtta yok'], [false, 'Alan yanıtta yok']]);
    const altinSonucu = yavas.find((x) => x.tur === 'altinYanit')!;
    expect(altinSonucu.gecti).toBe(false);
    expect(altinSonucu.alt?.every((x) => x.tur === 'altinFark' && ['eklenen alan', 'kaldırılan alan', 'değişen alan'].includes(x.aciklama))).toBe(true);
    expect(yavas.find((x) => x.tur === 'yanitSuresi')).toMatchObject({ gecti: false, aciklama: '3000 ms (sınır 2000 ms)' });
  });

  test('geçersiz kayıtlar reddedilir: yol / işleç / değer / aralık / maskeli değer / VEYA içinde altın yanıt / süre sınırı', () => {
    const hata = (k: Record<string, unknown>) => () => kaydet([k]);
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', islec: 'var' })).toThrow('alan yolu gerekli');
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', yol: '/a', islec: 'buyuk' })).toThrow('işleç geçersiz');
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', yol: '/a', islec: 'esit' })).toThrow('değer gerekli');
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', yol: '/a', islec: 'aralik' })).toThrow('en az ya da en çok');
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', yol: '/a', islec: 'aralik', enAz: 5, enCok: 1 })).toThrow('büyük olamaz');
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', yol: '/a', islec: 'esit', deger: 'ab***' })).toThrow('maskelenmiş değer');
    expect(hata({ tur: 'yanitAlani', kaynak: 'xml', yol: '/a', islec: 'desen', deger: '(' })).toThrow('desen geçersiz');
    expect(hata({ tur: 'veya', alt: [{ tur: 'altinYanit', bicim: 'xml', yapi: ['/a'] }, { tur: 'soapYaniti' }] })).toThrow('VEYA içinde');
    expect(hata({ tur: 'yanitSuresi', deger: '0' })).toThrow('1–600000');
    expect(hata({ tur: 'altinYanit', bicim: 'xml', yapi: [] })).toThrow('yapısı boş');
  });

  test('eski "eşit" kontrolleri (XPath / JSON) ve diğer türler aynen çalışır', () => {
    const eski = kaydet([
      { tur: 'xpathEsit', xpath: `${K}/Durum`, deger: 'BASARILI' }, { tur: 'xpathEsit', xpath: '//SiparisNo', deger: '70012345' },
      { tur: 'soapYaniti' }, { tur: 'soapHatasiYok' }, { tur: 'icerir', deger: '<Durum>BASARILI</Durum>' }, { tur: 'durumKodu', deger: '200-299' }
    ]) as ServisKontrolu[];
    expect(eski[0]).toEqual({ tur: 'xpathEsit', xpath: `${K}/Durum`, deger: 'BASARILI' });
    expect(kontrolleriDegerlendir({ durumKodu: 200, govde: XML }, eski).map((x) => [x.ad, x.gecti, x.aciklama])).toEqual([
      [`${K}/Durum = "BASARILI"`, true, '"BASARILI"'], ['//SiparisNo = "70012345"', true, '"70012345"'], ['Yanıt geçerli bir SOAP zarfı', true, 'SOAP zarfı'],
      ['SOAP hatası (Fault) yok', true, 'Hata yok'], ['Yanıtta geçer: "<Durum>BASARILI</Durum>"', true, 'Bulundu'], ['HTTP durum kodu 200-299', true, 'Durum kodu 200']
    ]);
    const json = kaydet([{ tur: 'jsonEsit', yol: 'veri.no', deger: '70012345' }]) as ServisKontrolu[];
    expect(kontrolleriDegerlendir({ durumKodu: 200, govde: JSON_YANIT }, json)[0]).toMatchObject({ ad: 'JSON veri.no = "70012345"', gecti: true });
    expect(kontrolleriDegerlendir({ durumKodu: 200, govde: JSON_YANIT }, [{ tur: 'jsonEsit', yol: 'veri.no', deger: '1' }])[0]).toMatchObject({ gecti: false, aciklama: 'Görülen: "70012345"' });
  });
});
