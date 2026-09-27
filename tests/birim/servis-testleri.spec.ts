// KORUMA TESTLERİ — servis testleri (scripts/platform/servisler/): SoapUI içe aktarma, parametre çözümü (tarih kuralı,
// giriş bilgisi profili, test verisi eşlemesi), erişim kontrolü, Dene / koşu kuralları, raporda maskeleme.
// Tarayıcı AÇMAZ. İstekler yalnızca 127.0.0.1'de açılan SAHTE SOAP sunucusuna gider; şirket sitesine istek yoktur.
// SoapUI dosyası SENTETİKTİR (gerçek kanal / kullanıcı / kimlik içermez).
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import {
  DepoHatasi, kosulariListele, ortamKaydet, projeKaydet, testVerisiProfiliKaydet, testVerisiTuruKaydet, testVerisiTurleriniListele,
  veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import {
  senaryoIceriginiDogrula, servisGetir, servisKimligiKaydet, servisKimlikOzeti, servisKosulariniListele, servisKosusuGetir, servisSenaryolariniListele, servisSenaryosuKaydet
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import {
  erisimKontrolu, girisProfiliniTestVerisineTasi, servisiKaydet, servisParametreleri, servisSenaryolariniKos, servisSenaryosuCalistir, soapuiAktar, soapuiOnizle
} from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { kontrolleriDegerlendir, yerTutuculariDoldur } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { groovyOzellikleri, servisTaslaklari, soapuiCozumle } from '../../scripts/platform/servisler/soapui-ice-aktarma.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { GROOVY, SAHTE_PAROLA, SAHTE_TC, SOAPUI, sahteSoapSunucusu, yanit, type SahteIstek } from './servis-fikstur';

const PAROLA = 'Servis-Birim-Kasa-1';
let istekler: SahteIstek[] = [];
let adres = '';
let kapat: () => Promise<void> = async () => undefined;
test.beforeAll(async () => { ({ adres, istekler, kapat } = await sahteSoapSunucusu()); });
test.afterAll(async () => { await kapat(); });

// ---- Saf işlevler --------------------------------------------------------------------------------------------------------

test('SoapUI: parametreler sade yazımla kalır; giriş bilgisi / tarih / test verisi ayrılır; doğrulamalar çevrilir', () => {
  const g = groovyOzellikleri(GROOVY);
  expect(g.ozellikler).toMatchObject({
    BEGIN_DATE: { tur: 'tarih', ifade: "bugun|yyyy-MM-dd'T'HH:mm:ss" }, END_DATE: { tur: 'tarih', ifade: "bugun+1y|yyyy-MM-dd'T'HH:mm:ss" },
    ENDSHORT_DATE: { tur: 'tarih', ifade: "bugun+60g|yyyy-MM-dd'T'HH:mm:ss" }, PASSWORD: { tur: 'deger', deger: SAHTE_PAROLA }
  });
  const t = servisTaslaklari(soapuiCozumle(SOAPUI), { takim: 'Takim', durum: 'OrnekDurum' });
  expect(t.kimlikAdaylari).toEqual({ CHANNEL: '100', USERNAME: 'kullanici100', PASSWORD: SAHTE_PAROLA });
  expect(t.tarihKurallari).toEqual({ BEGIN_DATE: "bugun|yyyy-MM-dd'T'HH:mm:ss", END_DATE: "bugun+1y|yyyy-MM-dd'T'HH:mm:ss" });
  expect(t.veriParametreleri).toEqual(['MUSTERI_TC']);
  expect(t.durum.uyarilar.join(' ')).toContain('Aktarım');
  const [s] = t.servisler;
  expect(s).toMatchObject({ anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/ornek.asmx', soapSurumu: '1.1', operasyonlar: [{ ad: 'Teklif', eylem: 'Ornek/Teklif' }] });
  const [gecersiz, gecerli, baska] = s.senaryolar;
  expect(gecersiz.govde).toContain('<Channel>${CHANNEL}</Channel><Username>${USERNAME}</Username><Password>${PASSWORD}</Password>');
  expect(gecersiz.govde).toContain('<BeginDate>${BEGIN_DATE}</BeginDate>');
  expect(gecerli.govde).toContain('<CitizenshipNumber>${MUSTERI_TC}</CitizenshipNumber>');
  // Değerler gövdeye yazılmaz (ne parola ne dosyadaki test verisi).
  for (const x of s.senaryolar) { expect(x.govde).not.toContain(SAHTE_PAROLA); expect(x.govde).not.toContain('55555555555'); }
  expect(gecersiz.kontroller).toEqual([{ tur: 'soapYaniti' }, { tur: 'icerir', deger: '<Durum>HATA</Durum>' }]);
  // Bilerek başka kanal deneyen adım kendi değerini korur.
  expect(baska.govde).toContain('<Channel>999</Channel><Username>kullanici999</Username>');
  expect(baska.uyarilar.join(' ')).toContain('kendi');
});

test('SoapUI: gövdedeki satır sonu kalıntısı (düz metin "\\r") atılır; gövdenin içindeki diğer ters bölüler kalır', () => {
  const kirli = SOAPUI.replace(/<Input>/g, '<Input>\\r\n   ').replace(/<\/Input>/g, '<Note>a\\rb</Note>\\r\n</Input>');
  const t = servisTaslaklari(soapuiCozumle(kirli), { takim: 'Takim', durum: 'OrnekDurum' });
  for (const x of t.servisler[0].senaryolar) {
    expect(x.govde).not.toMatch(/\\r(?=\r?\n|$)/);
    expect(x.govde).toContain('<Note>a\\rb</Note>');
  }
});

test('yer tutucular: tarih kuralı, değer (XML kaçışlı), doğrudan tarih; eksikler nedenleriyle', () => {
  const simdi = new Date(2026, 8, 26, 10, 5, 7);
  const g = yerTutuculariDoldur('<a>${BEGIN_DATE}</a><b>${END}</b><c>${AD}</c><d>${tarih:bugun-30g|dd.MM.yyyy}</d>', {
    degerler: { AD: 'A&B' }, tarihKurallari: { BEGIN_DATE: "bugun|yyyy-MM-dd'T'HH:mm:ss", END: 'bugun+1y|yyyy-MM-dd' }, simdi
  });
  expect(g).toBe('<a>2026-09-26T10:05:07</a><b>2027-09-26</b><c>A&amp;B</c><d>27.08.2026</d>');
  expect(() => yerTutuculariDoldur('${X}${Y}', { degerler: {}, eksikAciklamasi: (a) => `neden-${a}` })).toThrow(/X \(neden-X\), Y \(neden-Y\)/);
});

test('kontroller: SOAP zarfı, Fault, içerir / içermez, xpath, durum kodu', () => {
  const ok = { durumKodu: 200, govde: yanit('OK', 'Tamam') };
  const fault = { durumKodu: 500, govde: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Sunucu hatası</faultstring></soap:Fault></soap:Body></soap:Envelope>' };
  const s = kontrolleriDegerlendir(ok, [{ tur: 'soapYaniti' }, { tur: 'soapHatasiYok' }, { tur: 'icerir', deger: '<Durum>OK</Durum>' }, { tur: 'icermez', deger: 'HATA' },
    { tur: 'xpathEsit', xpath: '/Envelope/Body/TeklifResponse/Sonuc/Durum', deger: 'OK' }, { tur: 'durumKodu', deger: '200-299' }]);
  expect(s.map((x) => x.gecti)).toEqual([true, true, true, true, true, true]);
  const f = kontrolleriDegerlendir(fault, [{ tur: 'soapHatasiYok' }, { tur: 'soapHatasi' }, { tur: 'durumKodu', deger: '200' }, { tur: 'soapYaniti' }]);
  expect(f.map((x) => x.gecti)).toEqual([false, true, false, true]);
  expect(f[0].aciklama).toContain('Sunucu hatası');
  expect(kontrolleriDegerlendir({ durumKodu: 200, govde: 'düz metin' }, [{ tur: 'soapYaniti' }])[0].gecti).toBe(false);
  // VEYA: alt kontrollerden biri yeter; hiçbiri tutmazsa kalır; alt sonuçlar döner.
  const [veya] = kontrolleriDegerlendir(ok, [{ tur: 'veya', alt: [{ tur: 'icerir', deger: '<Durum>HATA</Durum>' }, { tur: 'icerir', deger: '<Durum>OK</Durum>' }] }]);
  expect(veya).toMatchObject({ gecti: true, aciklama: 'Geçen: Yanıtta geçer: "<Durum>OK</Durum>"' });
  expect(veya.alt?.map((a) => a.gecti)).toEqual([false, true]);
  expect(kontrolleriDegerlendir(ok, [{ tur: 'veya', alt: [{ tur: 'icerir', deger: 'X' }, { tur: 'icermez', deger: 'OK' }] }])[0]).toMatchObject({ gecti: false, aciklama: 'Hiçbiri geçmedi' });
  // Doğrulama: VEYA en az iki alt kontrol ister, iç içe VEYA yok, alt kontrol de doğrulanır.
  const icerik = (kontroller: unknown[]) => ({ operasyon: 'Teklif', govde: '<a/>', kontroller });
  expect(senaryoIceriginiDogrula(icerik([{ tur: 'veya', alt: [{ tur: 'soapYaniti' }, { tur: 'icerir', deger: 'x', fazla: 1 }] }])).kontroller)
    .toEqual([{ tur: 'veya', alt: [{ tur: 'soapYaniti' }, { tur: 'icerir', deger: 'x' }] }]);
  expect(() => senaryoIceriginiDogrula(icerik([{ tur: 'veya', alt: [{ tur: 'soapYaniti' }] }]))).toThrow(/en az iki/);
  expect(() => senaryoIceriginiDogrula(icerik([{ tur: 'veya', alt: [{ tur: 'veya', alt: [] }, { tur: 'soapYaniti' }] }]))).toThrow(/VEYA içinde VEYA/);
  expect(() => senaryoIceriginiDogrula(icerik([{ tur: 'veya', alt: [{ tur: 'soapYaniti' }, { tur: 'icerir' }] }]))).toThrow(/1\.2\. kontrol/);
});

// ---- Uçtan uca (veritabanı + sahte sunucu) --------------------------------------------------------------------------------

test.describe('servis kayıtları, parametreler ve koşu', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('servis');
  let vt: Veritabani;
  let projeId = '';
  let testOrtami = '';
  let canliOrtam = '';
  let servisId = '';
  let turId = '';
  let profilId = '';

  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });

  test('kurulum: test verisi türünde servis parametresi eşlemesi; aktarım eşlemesiz kaydederse korunur; çift eşleme reddedilir', async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Servis projesi' });
    testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: adres, varsayilan: true });
    canliOrtam = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: adres, ayarlar: { canli: true } });
    turId = testVerisiTuruKaydet(vt, { projeId, ad: 'Kişi', alanlar: [
      { ad: 'tcKimlikNo', servisParametreleri: [{ ad: 'MUSTERI_TC', rol: 'musteri' }, { ad: 'KEFIL_TC', rol: 'kefil' }] },
      { ad: 'adi', hassas: false }
    ] });
    // Koddan aktarım gibi eşleme vermeden kaydetmek mevcut eşlemeyi silmez.
    testVerisiTuruKaydet(vt, { id: turId, projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo' }, { ad: 'adi', hassas: false }] });
    expect(testVerisiTurleriniListele(vt, projeId)[0].alanlar[0].servisParametreleri).toEqual([{ ad: 'MUSTERI_TC', rol: 'musteri' }, { ad: 'KEFIL_TC', rol: 'kefil' }]);
    expect(() => testVerisiTuruKaydet(vt, { projeId, ad: 'Başka', alanlar: [{ ad: 'no', servisParametreleri: [{ ad: 'MUSTERI_TC' }] }] })).toThrow(/zaten "Kişi" türünün "tcKimlikNo"/);
    expect(() => testVerisiTuruKaydet(vt, { projeId, ad: 'Bozuk', alanlar: [{ ad: 'no', servisParametreleri: [{ ad: '1AD' }] }] })).toThrow(DepoHatasi);
    profilId = testVerisiProfiliKaydet(vt, { projeId, turId, ad: 'k1', degerler: { tcKimlikNo: SAHTE_TC, adi: 'Deneme' } });
  });

  test('erişim kontrolü yalnız test ortamında; başarılı kontrol olmadan servis kaydedilmez', async () => {
    expect(() => servisiKaydet(vt, projeId, { anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/ornek.asmx' })).toThrow(/Erişimi kontrol et/);
    await expect(erisimKontrolu(vt, projeId, { ortamId: canliOrtam, yol: '/Servis/ornek.asmx' })).rejects.toThrow(/yalnızca test ortamında/);
    const yanlis = await erisimKontrolu(vt, projeId, { ortamId: testOrtami, yol: '/Yok/servis.asmx' });
    expect(yanlis).toMatchObject({ erisilebilir: false });
    const once = istekler.length;
    const e = await erisimKontrolu(vt, projeId, { ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    expect(e.erisilebilir).toBe(true);
    if (!e.erisilebilir) return;
    expect(e.operasyonlar).toEqual([{ ad: 'Teklif', eylem: 'Ornek/Teklif' }, { ad: 'Onayla', eylem: 'Ornek/Onayla' }]);
    expect(istekler.slice(once).map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /Servis/ornek.asmx?wsdl']);
    // Kontrol başka adres için geçmez.
    expect(() => servisiKaydet(vt, projeId, { anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/baska.asmx', erisimKimligi: e.erisimKimligi })).toThrow(/Adres/);

    // Giriş bilgisi tablosu: sütun adları WSDL alanlarıyla aynı → aktarım alanları kendiliğinden bağlar.
    const girisTablosu = tabloKaydet(vt, { projeId, ad: 'Giriş', sutunlar: [{ ad: 'Channel' }, { ad: 'Username' }, { ad: 'Password', gizli: true }] });
    const onizleme = soapuiOnizle(vt, projeId, SOAPUI, { takim: 'Takim', durum: 'OrnekDurum' });
    expect(JSON.stringify(onizleme)).not.toContain(SAHTE_PAROLA);
    expect(onizleme.veriParametreleri).toEqual([{ ad: 'MUSTERI_TC', esleme: { turAd: 'Kişi', alan: 'tcKimlikNo', rol: 'musteri' } }]);
    // Yeni bağlama modeli: MUSTERI_TC bilerek gövdede bırakılır (eski eşlemeyle çözülür — geriye uyum testleri aşağıda); parola
    // yalnız kullanıcı onayıyla (sifreliKaydet) şifreli sütuna yazılır; tarihler hesaplama kuralı olur ve alanlara kural bağı kurulur.
    const r = soapuiAktar(vt, projeId, { xml: SOAPUI, takim: 'Takim', durum: 'OrnekDurum', servis: 'ornek-service', erisimKimligi: e.erisimKimligi, girisEkle: true,
      ozellikler: { MUSTERI_TC: 'birak' }, sifreliKaydet: ['PASSWORD'] });
    expect(r).toMatchObject({ yeniServis: true, eklenen: 3, atlanan: [], baglananAlan: 5, tablo: null, girisSatiriEklendi: true, eksikSatirlar: [], eslenmemisParametreler: [] });
    servisId = r.servisId;
    // İkinci aktarım aynı başlıkları eklemez.
    expect(soapuiAktar(vt, projeId, { xml: SOAPUI, takim: 'Takim', durum: 'OrnekDurum', servis: 'ornek-service' })).toMatchObject({ yeniServis: false, eklenen: 0, tablo: null, baglananAlan: 0 });
    const s = servisGetir(vt, servisId);
    expect(s?.ayarlar).toMatchObject({ yol: '/Servis/ornek.asmx', erisim: { ortamId: testOrtami, durumKodu: 200 } });
    expect(s?.ayarlar.kimlikProfili).toBeUndefined();
    expect(s?.ayarlar.alanBaglari?.Teklif).toEqual({
      'Input/Channel': { tablo: girisTablosu, sutun: 'Channel' }, 'Input/Username': { tablo: girisTablosu, sutun: 'Username' }, 'Input/Password': { tablo: girisTablosu, sutun: 'Password' },
      'Input/BeginDate': { kural: 'BEGIN_DATE' }, 'Input/EndDate': { kural: 'END_DATE' } });
    // Gövdede giriş parametreleri tablo başvurusu; dosyadaki kanal / kullanıcı senaryonun tablo seçimi; giriş satırı tabloya eklendi.
    const gecerli = servisSenaryolariniListele(vt, servisId).find((x) => x.baslik === 'Geçerli kimlik');
    expect(gecerli?.icerik.govde).toContain('<Channel>${Giriş.Channel}</Channel><Username>${Giriş.Username}</Username><Password>${Giriş.Password}</Password><CitizenshipNumber>${MUSTERI_TC}</CitizenshipNumber>');
    expect(gecerli?.icerik.tabloSecimleri).toEqual({ [`${girisTablosu}|`]: { Channel: '100', Username: 'kullanici100' } });
    expect(tablolariListele(vt, projeId, { tabloId: girisTablosu })[0].satirlar.map((x) => [x.degerler.Channel, x.degerler.Username, x.doluGizli])).toEqual([['100', 'kullanici100', ['Password']]]);
    expect(s?.ayarlar.tarihKurallari).toEqual({ BEGIN_DATE: "bugun|yyyy-MM-dd'T'HH:mm:ss", END_DATE: "bugun+1y|yyyy-MM-dd'T'HH:mm:ss" });
    expect(servisKimlikOzeti(vt, projeId)).toEqual([]);
    // Giriş bilgileri veritabanında düz metin durmaz.
    const ham = JSON.stringify(vt.tumu('SELECT * FROM test_verisi_profilleri')) + JSON.stringify(vt.tumu('SELECT * FROM servis_senaryolari'));
    expect(ham).not.toContain(SAHTE_PAROLA);
    expect(ham).not.toContain('kullanici100');
  });

  test('Parametreler görünümü: her parametrenin kaynağı; rol için profil seçilmeden koşu açık nedenle hata verir', async () => {
    const p = servisParametreleri(vt, projeId, servisId);
    const kaynak = Object.fromEntries(p.parametreler.map((x) => [x.ad, x.kaynak.tur]));
    expect(kaynak).toEqual({ BEGIN_DATE: 'tarih', END_DATE: 'tarih', MUSTERI_TC: 'veri' });
    expect(p.roller).toEqual([{ anahtar: `${turId}:musteri`, turId, turAd: 'Kişi', rol: 'musteri', profilId: null }]);
    const gecerli = servisSenaryolariniListele(vt, servisId).find((x) => x.baslik === 'Geçerli kimlik');
    const r = await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId: gecerli?.id });
    expect(r.durum).toBe('hata');
    expect(r.hata).toContain('MUSTERI_TC ("Kişi" türü, "musteri" rolü için profil seçilmedi)');
  });

  test('Dene (test): değerler çözülür, SOAPAction gönderilir; raporda parola ve hassas veri maskelidir; ekran koşularına yazılmaz', async () => {
    const s = servisGetir(vt, servisId);
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/ornek.asmx', veriProfilleri: { [`${turId}:musteri`]: profilId } });
    expect(servisGetir(vt, servisId)?.ayarlar.erisim).toEqual(s?.ayarlar.erisim);
    const senaryolar = servisSenaryolariniListele(vt, servisId);
    const gecerli = senaryolar.find((x) => x.baslik === 'Geçerli kimlik');
    const once = istekler.length;
    const r = await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId: gecerli?.id, simdi: new Date(2026, 0, 2, 3, 4, 5) });
    expect(r.durum, r.hata).toBe('basarili');
    const giden = istekler[once];
    expect(giden.eylem).toBe('"Ornek/Teklif"');
    expect(giden.govde).toContain(`<Channel>100</Channel><Username>kullanici100</Username><Password>${SAHTE_PAROLA}</Password><CitizenshipNumber>${SAHTE_TC}</CitizenshipNumber><EndDate>2027-01-02T03:04:05</EndDate>`);
    const kayit = servisKosusuGetir(vt, r.kosuId);
    const rapor = JSON.stringify(kayit);
    expect(rapor).not.toContain(SAHTE_PAROLA);
    expect(rapor).not.toContain(SAHTE_TC);
    expect(kayit?.sonuc.istek).toContain('<Password>***</Password><CitizenshipNumber>***</CitizenshipNumber>');
    expect(kayit?.sonuc.ozet).toBe('Kimlik *** kabul');
    expect(kayit).toMatchObject({ tur: 'dene', durum: 'basarili', ortamId: testOrtami, senaryoId: gecerli?.id });
    expect(kosulariListele(vt, { projeId })).toEqual([]);
    // Kontrol tutmazsa "basarisiz".
    const taslak = await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', taslak: { baslik: 'Taslak', icerik: { ...gecerli?.icerik, kontroller: [{ tur: 'icerir', deger: '<Durum>YOK</Durum>' }] } } });
    expect(taslak.durum).toBe('basarisiz');
    expect(taslak.kontroller?.[0]).toMatchObject({ gecti: false });
  });

  test('canlı ortam: Dene yok; kapsamı "test" olan senaryo koşmaz; "yalnız test" operasyonu hiç koşmaz', async () => {
    const [ilk] = servisSenaryolariniListele(vt, servisId);
    await expect(servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: canliOrtam, tur: 'dene', senaryoId: ilk.id })).rejects.toThrow(/yalnızca test ortamında/);
    await expect(servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: canliOrtam, tur: 'kosu', senaryoId: ilk.id })).rejects.toThrow(/yalnızca test ortamda/);
    const once = istekler.length;
    const kos = await servisSenaryolariniKos(vt, projeId, { servisId, ortamId: canliOrtam });
    expect(kos).toMatchObject({ ortamTuru: 'canli', atlanan: 3, sonuclar: [] });
    servisSenaryosuKaydet(vt, { id: ilk.id, projeId, servisId, baslik: ilk.baslik, kapsam: 'ikisi', icerik: ilk.icerik });
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/ornek.asmx', yalnizTestOperasyonlari: ['Teklif'] });
    await expect(servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: canliOrtam, tur: 'kosu', senaryoId: ilk.id })).rejects.toThrow(/yalnız test ortamında koşar/);
    expect((await servisSenaryolariniKos(vt, projeId, { servisId, ortamId: canliOrtam })).sonuclar).toEqual([]);
    expect(istekler.length).toBe(once);
  });

  test('koşu (test): dahil senaryolar sırayla koşar; bilerek başka kanal gönderen senaryo kendi değeriyle gider', async () => {
    const once = istekler.length;
    const kos = await servisSenaryolariniKos(vt, projeId, { servisId, ortamId: testOrtami });
    expect(kos.sonuclar.map((x) => [x.baslik, x.durum])).toEqual([['Geçersiz kimlik', 'basarili'], ['Geçerli kimlik', 'basarili'], ['Başka kanal', 'basarili']]);
    expect(istekler[once + 2].govde).toContain('<Channel>999</Channel><Username>kullanici999</Username>');
    expect(servisKosulariniListele(vt, { servisId }).filter((k) => k.tur === 'kosu')).toHaveLength(3);
  });

  test('eski giriş profili test verisine taşınır: önizleme → onay; ortama özel değer ayrı profil; servis bağlanır; Dene aynı değerleri gönderir', async () => {
    // Eski yapı: servis kasadaki giriş profilini kullanıyor (artık aktarım oluşturmaz; eski kayıtlar taşınır).
    servisKimligiKaydet(vt, { projeId, ad: 'Kanal 100', degerler: { CHANNEL: '100', USERNAME: 'kullanici100', PASSWORD: SAHTE_PAROLA } });
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek-service', ad: 'OrnekService', yol: '/Servis/ornek.asmx', kimlikProfili: 'Kanal 100' });
    servisKimligiKaydet(vt, { projeId, ad: 'Kanal 100', ortamId: canliOrtam, degerler: { PASSWORD: 'canli-parola-2' } });
    const on = girisProfiliniTestVerisineTasi(vt, projeId, { ad: 'Kanal 100' });
    expect(on).toEqual({ onizleme: {
      tur: 'Servis girişi', yeniTur: true, rol: 'giris',
      eklenecekAlanlar: [{ alan: 'kanal', parametre: 'CHANNEL', hassas: false }, { alan: 'parola', parametre: 'PASSWORD', hassas: true }, { alan: 'kullanici', parametre: 'USERNAME', hassas: true }],
      profiller: [{ ad: 'Kanal 100', ortam: null, alanlar: ['kanal', 'parola', 'kullanici'] }, { ad: 'Kanal 100 · CANLI', ortam: 'CANLI', alanlar: ['kanal', 'parola', 'kullanici'] }],
      servisler: ['OrnekService'],
      // Yeni tablo: var olan değer değişmez, senaryolara etki yok (tablo-etkisi.mjs).
      etki: { degisiklikler: [], etkilenenler: [], karsiliklar: [] }
    } });
    expect(servisGetir(vt, servisId)?.ayarlar.kimlikProfili).toBe('Kanal 100');
    expect(girisProfiliniTestVerisineTasi(vt, projeId, { ad: 'Kanal 100', onay: true })).toMatchObject({ tasindi: true });
    const s = servisGetir(vt, servisId);
    expect(s?.ayarlar.kimlikProfili).toBeUndefined();
    const tur = testVerisiTurleriniListele(vt, projeId).find((x) => x.ad === 'Servis girişi');
    expect(tur?.alanlar.map((a) => [a.ad, a.hassas, a.servisParametreleri])).toEqual([
      ['kanal', false, [{ ad: 'CHANNEL', rol: 'giris' }]], ['parola', true, [{ ad: 'PASSWORD', rol: 'giris' }]], ['kullanici', true, [{ ad: 'USERNAME', rol: 'giris' }]]]);
    expect(Object.keys(s?.ayarlar.veriProfilleri ?? {}).sort()).toEqual([`${tur?.id}:giris`, `${tur?.id}:giris@${canliOrtam}`, `${turId}:musteri`].sort());
    // Dene (TEST): değerler artık test verisinden gelir — gövde öncekiyle aynı; parola raporda maskeli.
    const gecerli = servisSenaryolariniListele(vt, servisId).find((x) => x.baslik === 'Geçerli kimlik');
    const once = istekler.length;
    const d = await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId: gecerli?.id });
    expect(d.durum, d.hata).toBe('basarili');
    expect(istekler[once].govde).toContain(`<Channel>100</Channel><Username>kullanici100</Username><Password>${SAHTE_PAROLA}</Password>`);
    expect(JSON.stringify(servisKosusuGetir(vt, d.kosuId))).not.toContain(SAHTE_PAROLA);
    // İkinci kez: tür artık var ve eşli → yeni tür / alan açılmaz; servis zaten ayrılmış.
    expect(girisProfiliniTestVerisineTasi(vt, projeId, { ad: 'Kanal 100' })).toMatchObject({ onizleme: { tur: 'Servis girişi', yeniTur: false, eklenecekAlanlar: [], servisler: [] } });
  });
});
