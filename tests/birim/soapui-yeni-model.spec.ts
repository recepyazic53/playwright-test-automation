// KORUMA TESTLERİ — SoapUI içe aktarmanın YENİ BAĞLAMA MODELİ (soapui-aktarimi.mjs): proje / ortam / takım / test durumu özellikleri
// ve Groovy tarih betikleri → test verisi tablosu sütunları, metot alan bağları, hesaplama kuralı önerileri; gizli adlı özelliğin değeri
// yalnız kullanıcı onayıyla şifreli yazılır. Eski eşlemeli (veriProfilleri) servisin önizleme + onayla dönüşümü; dönüşümden önce ve
// sonra aynı değer gönderilir (geriye uyum). Yalnız 127.0.0.1'deki SAHTE SOAP sunucusu ve geçici veritabanı; dosya SENTETİKTİR.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, testVerisiProfiliKaydet, testVerisiTuruKaydet, testVerisiTurleriniListele, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisGetir, servisKaydet, servisSenaryolariniListele, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, eskiParametreleriDonustur, servisSenaryosuCalistir, soapuiAktar, soapuiOnizle } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { alanBasvurulari, servisTaslaklari, soapuiCozumle } from '../../scripts/platform/servisler/soapui-ice-aktarma.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { GROOVY, SAHTE_TC, WSDL, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

const PAROLA = 'SoapUI-Yeni-Model-Kasa-1';
const SAHTE_TOKEN = 'sahte-anahtar-degeri-77';

const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Teklif xmlns="Ornek"><Input>${ic}</Input></Teklif></s:Body></s:Envelope>`;
const istek = (ad: string, govde: string) => `
      <con:testStep type="request" name="${ad}"><con:config xsi:type="con:RequestStep" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <con:interface>OrnekServiceSoap</con:interface><con:operation>Teklif</con:operation>
        <con:request name="${ad}"><con:endpoint>http://eski-adres.invalid/Servis/ornek.asmx</con:endpoint>
          <con:request><![CDATA[${govde}]]></con:request><con:assertion type="SOAP Response" id="a1"/>
        </con:request></con:config></con:testStep>`;
/** Özellikler dört kapsamda: proje (KULLANICI, API_TOKEN gizli), ortam (MUSTERI_NO), takım (SUBE), test durumu + Groovy (tarihler). */
const DOSYA = `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project id="p" name="Model Proje" xmlns:con="http://eviware.com/soapui/config">
  <con:interface xsi:type="con:WsdlInterface" name="OrnekServiceSoap" soapVersion="1_1" definition="http://eski-adres.invalid/Servis/ornek.asmx?wsdl" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <con:operation id="o1" action="Ornek/Teklif" name="Teklif" type="Request-Response"/>
  </con:interface>
  <con:testSuite id="t" name="Model Takimi">
    <con:testCase id="c" name="Durum">
      <con:testStep type="groovy" name="Tarihler"><con:config><script>${GROOVY}</script></con:config></con:testStep>
      ${istek('Teklif al', zarf('<Channel>${#TestSuite#SUBE}</Channel><Username>${#Project#KULLANICI}</Username><Password>${#Project#API_TOKEN}</Password>'
        + '<CitizenshipNumber>${#Env#MUSTERI_NO}</CitizenshipNumber><BeginDate>${#TestCase#BEGIN_DATE}</BeginDate><EndDate>${#TestCase#END_DATE}</EndDate>'))}
      <con:properties><con:property><con:name>NOT</con:name><con:value/></con:property></con:properties>
    </con:testCase>
    <con:properties><con:property><con:name>SUBE</con:name><con:value>7</con:value></con:property></con:properties>
  </con:testSuite>
  <con:environment id="e1" name="Deneme ortami"><con:properties><con:property><con:name>MUSTERI_NO</con:name><con:value>${SAHTE_TC}</con:value></con:property></con:properties></con:environment>
  <con:properties>
    <con:property><con:name>KULLANICI</con:name><con:value>deneme-kullanici</con:value></con:property>
    <con:property><con:name>API_TOKEN</con:name><con:value>${SAHTE_TOKEN}</con:value></con:property>
  </con:properties>
</con:soapui-project>`;

let istekler: SahteIstek[] = [];
let adres = '';
let kapat: () => Promise<void> = async () => undefined;
test.beforeAll(async () => { ({ adres, istekler, kapat } = await sahteSoapSunucusu()); });
test.afterAll(async () => { await kapat(); });

test('çözümleme: özellikler kapsamlarından okunur; gövdede doğrudan başvuran alanlar alan yoluyla çıkar', () => {
  const t = servisTaslaklari(soapuiCozumle(DOSYA), { takim: 'Model Takimi', durum: 'Durum' });
  const ozellik = Object.fromEntries(t.ozellikler.map((o) => [o.ad, o]));
  expect(ozellik.SUBE).toMatchObject({ kaynak: 'Takım', deger: '7' });
  expect(ozellik.USERNAME).toMatchObject({ kaynak: 'Proje', deger: 'deneme-kullanici' }); // giriş bilgisi ortak adıyla
  expect(ozellik.API_TOKEN).toMatchObject({ kaynak: 'Proje', deger: SAHTE_TOKEN });
  expect(ozellik.MUSTERI_NO).toMatchObject({ kaynak: 'Ortam', deger: SAHTE_TC });
  expect(ozellik.BEGIN_DATE).toMatchObject({ kaynak: 'Groovy', tarih: "bugun|yyyy-MM-dd'T'HH:mm:ss" });
  const [s] = t.servisler;
  expect(s.senaryolar[0].alanlar).toEqual([
    { yol: 'Input/Channel', ad: 'SUBE' }, { yol: 'Input/Username', ad: 'USERNAME' }, { yol: 'Input/Password', ad: 'API_TOKEN' },
    { yol: 'Input/CitizenshipNumber', ad: 'MUSTERI_NO' }, { yol: 'Input/BeginDate', ad: 'BEGIN_DATE' }, { yol: 'Input/EndDate', ad: 'END_DATE' }]);
  expect(alanBasvurulari('bozuk <xml')).toEqual([]);
  expect(alanBasvurulari(zarf('<Channel>a ${X}</Channel><Username>${Y}</Username>'))).toEqual([{ yol: 'Input/Username', ad: 'Y' }]);
});

test.describe('veritabanı ile', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('soapui-model');
  let vt: Veritabani;
  let projeId = '';
  let testOrtami = '';
  let erisimKimligi = '';

  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });

  test('kurulum ve erişim kontrolü (yalnız sahte sunucu)', async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Model projesi' });
    testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: adres, varsayilan: true, ayarlar: { riskli: false } });
    const e = await erisimKontrolu(vt, projeId, { ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    expect(e.erisilebilir).toBe(true);
    if (e.erisilebilir) erisimKimligi = e.erisimKimligi;
  });

  test('önizleme: plan (tablo / kural önerisi / kurulacak bağlar); gizli değer yanıtta yok', () => {
    const o = soapuiOnizle(vt, projeId, DOSYA, { takim: 'Model Takimi', durum: 'Durum' });
    expect(JSON.stringify(o)).not.toContain(SAHTE_TOKEN);
    const plan = o.servisler?.[0].plan;
    const oz = Object.fromEntries((plan?.ozellikler ?? []).map((x) => [x.ad, x]));
    expect(oz.API_TOKEN).toMatchObject({ gizli: true, tanimli: true, deger: null, varsayilan: 'tablo', kaynak: 'Proje' });
    expect(oz.SUBE).toMatchObject({ gizli: false, deger: '7', varsayilan: 'tablo' });
    expect(oz.BEGIN_DATE).toMatchObject({ tarih: "bugun|yyyy-MM-dd'T'HH:mm:ss", varsayilan: 'kural' });
    expect(plan?.alanlar.map((a) => `${a.operasyon}|${a.yol}→${a.ozellik}`)).toContain('Teklif|Input/Password→API_TOKEN');
    expect(plan?.tabloAdi).toBe('SoapUI Model Takimi');
  });

  test('aktarım (varsayılanlar): tablo sütunları + değerler, gizli değer onaysız boş, kural önerisi eklenir, alan bağları; eski yapı yazılmaz', async () => {
    const r = soapuiAktar(vt, projeId, { xml: DOSYA, takim: 'Model Takimi', durum: 'Durum', servis: 'ornek-service', erisimKimligi,
      baglar: ['Teklif|Input/Channel', 'Teklif|Input/Password', 'Teklif|Input/CitizenshipNumber', 'Teklif|Input/BeginDate'] });
    expect(r).toMatchObject({ yeniServis: true, eklenen: 1, eklenenKurallar: ['BEGIN_DATE', 'END_DATE'], eslenmemisParametreler: [],
      tablo: { ad: 'SoapUI Model Takimi', yeni: true, sutunSayisi: 4, sifreliYazilan: [], bosBirakilan: ['API_TOKEN'] } });
    const [tablo] = tablolariListele(vt, projeId, { cozulsun: true }).filter((x) => x.ad === 'SoapUI Model Takimi');
    expect(tablo.sutunlar.map((c) => [c.ad, c.gizli])).toEqual([['SUBE', false], ['USERNAME', false], ['API_TOKEN', true], ['MUSTERI_NO', false]]);
    expect(tablo.satirlar).toHaveLength(1);
    expect(tablo.satirlar[0].degerler).toMatchObject({ SUBE: '7', USERNAME: 'deneme-kullanici', MUSTERI_NO: SAHTE_TC });
    expect(tablo.satirlar[0].degerler.API_TOKEN ?? null).toBeNull();
    const s = servisGetir(vt, r.servisId);
    // Yalnız seçilen bağlar kuruldu (Username / EndDate seçilmedi).
    expect(s?.ayarlar.alanBaglari?.Teklif).toEqual({
      'Input/Channel': { tablo: tablo.id, sutun: 'SUBE' }, 'Input/Password': { tablo: tablo.id, sutun: 'API_TOKEN' },
      'Input/CitizenshipNumber': { tablo: tablo.id, sutun: 'MUSTERI_NO' }, 'Input/BeginDate': { kural: 'BEGIN_DATE' } });
    expect(s?.ayarlar.tarihKurallari).toEqual({ BEGIN_DATE: "bugun|yyyy-MM-dd'T'HH:mm:ss", END_DATE: "bugun+1y|yyyy-MM-dd'T'HH:mm:ss" });
    expect(s?.ayarlar.veriProfilleri).toBeUndefined();
    expect(testVerisiTurleriniListele(vt, projeId).flatMap((x) => x.alanlar).some((a) => a.servisParametreleri?.length)).toBe(false);
    const [sn] = servisSenaryolariniListele(vt, r.servisId);
    expect(sn.icerik.govde).toContain('<Channel>${SoapUI Model Takimi.SUBE}</Channel><Username>${SoapUI Model Takimi.USERNAME}</Username><Password>${SoapUI Model Takimi.API_TOKEN}</Password>');
    expect(sn.icerik.govde).toContain('<BeginDate>${BEGIN_DATE}</BeginDate>');
    // Gizli değer onaysız yazılmadı: koşu açık nedenle durur (değer boş).
    const kosu = await servisSenaryosuCalistir(vt, projeId, { servisId: r.servisId, ortamId: testOrtami, tur: 'dene', senaryoId: sn.id });
    expect(kosu.durum).toBe('hata');
    expect(kosu.hata).toContain('API_TOKEN');
    // Veritabanında düz metin yok.
    expect(JSON.stringify(vt.tumu('SELECT * FROM test_verisi_profilleri'))).not.toContain(SAHTE_TOKEN);
  });

  test('aktarım (onaylı gizli değer, bağlı sütun): parola şifreli yazılır; mevcut bağ korunur, istek değeri gönderir', async () => {
    // Aynı başlıklı senaryo zaten var: başka takım adıyla yeni tabloya, senaryo adı değiştirilerek yeniden aktarılır.
    const dosya = DOSYA.replace('name="Teklif al"', 'name="Teklif al 2"').replace(/name="Teklif al"/g, 'name="Teklif al 2"');
    const once = istekler.length;
    const r = soapuiAktar(vt, projeId, { xml: dosya, takim: 'Model Takimi', durum: 'Durum', servis: 'ornek-service', sifreliKaydet: ['API_TOKEN'] });
    // Servisin alanları zaten bağlı: özellikler "bağlı sütun" hedefini önerir ve bağlar değişmez; tablo yazılmaz.
    expect(r).toMatchObject({ yeniServis: false, eklenen: 1, baglananAlan: 2, tablo: null });
    const s = servisGetir(vt, r.servisId);
    expect(s?.ayarlar.alanBaglari?.Teklif?.['Input/EndDate']).toEqual({ kural: 'END_DATE' });
    const sn = servisSenaryolariniListele(vt, r.servisId).find((x) => x.baslik === 'Teklif al 2');
    expect(sn?.icerik.govde).toContain('<Password>${SoapUI Model Takimi.API_TOKEN}</Password>');
    expect(sn?.icerik.tabloSecimleri).toBeTruthy();
    // Gizli değer bağlı tabloda yoktu; onay (sifreliKaydet) + girisEkle olmadan eklenmez → hâlâ boş.
    const tablo = tablolariListele(vt, projeId).find((x) => x.ad === 'SoapUI Model Takimi');
    expect(tablo?.satirlar[0].doluGizli).toEqual([]);
    expect(istekler.length).toBe(once);
  });

  test('eski eşlemeli servis: önizleme dönüştürmez; onayla ${PARAMETRE} → ${Tablo[etiket].Sütun}, satır seçimi ve alan bağı; aynı değer gider', async () => {
    const turId = testVerisiTuruKaydet(vt, { projeId, ad: 'Kişi', alanlar: [{ ad: 'tcKimlikNo', hassas: false, servisParametreleri: [{ ad: 'MUSTERI_TC', rol: 'musteri' }] }, { ad: 'adi', hassas: false }] });
    testVerisiProfiliKaydet(vt, { projeId, turId, ad: 'k0', degerler: { tcKimlikNo: '99999999999', adi: 'Başka' } });
    const profil = testVerisiProfiliKaydet(vt, { projeId, turId, ad: 'k1', degerler: { tcKimlikNo: SAHTE_TC, adi: 'Deneme' } });
    const servisId = servisKaydet(vt, { projeId, anahtar: 'eski-servis', ad: 'Eski', ayarlar: {
      yol: '/Servis/ornek.asmx', operasyonSemalari: wsdlSemalari(WSDL), veriProfilleri: { [`${turId}:musteri`]: profil }
    } });
    const govde = zarf('<CitizenshipNumber>${MUSTERI_TC}</CitizenshipNumber><BeginDate>2026-01-01T00:00:00</BeginDate><EndDate>2026-01-01T00:00:00</EndDate>');
    const senaryoId = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Eski senaryo', icerik: { operasyon: 'Teklif', govde, kontroller: [{ tur: 'soapYaniti' }, { tur: 'icerir', deger: '<Durum>OK</Durum>' }] } });
    // Geriye uyum: eski yapı koşuda okunur.
    const eskiKosu = await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId });
    expect(eskiKosu.durum, eskiKosu.hata).toBe('basarili');

    const o = eskiParametreleriDonustur(vt, projeId, { servisId });
    expect('onizleme' in o).toBe(true);
    if (!('onizleme' in o)) return;
    expect(o.onizleme.parametreler).toEqual([{ ad: 'MUSTERI_TC', hedef: 'Kişi[musteri].tcKimlikNo', tablo: 'Kişi', sutun: 'tcKimlikNo', etiket: 'musteri', rol: 'musteri', satir: 'k1', senaryoSayisi: 1 }]);
    expect(o.onizleme.baglar).toEqual([{ operasyon: 'Teklif', yol: 'Input/CitizenshipNumber', hedef: 'Kişi[musteri].tcKimlikNo' }]);
    // Önizleme hiçbir şey yazmaz.
    expect(servisSenaryolariniListele(vt, servisId)[0].icerik.govde).toBe(govde);
    expect(servisGetir(vt, servisId)?.ayarlar.alanBaglari).toBeUndefined();

    eskiParametreleriDonustur(vt, projeId, { servisId, onay: true });
    const [sn] = servisSenaryolariniListele(vt, servisId);
    expect(sn.icerik.govde).toContain('<CitizenshipNumber>${Kişi[musteri].tcKimlikNo}</CitizenshipNumber>');
    expect(sn.icerik.tabloSecimleri).toEqual({ [`${turId}|musteri`]: { tcKimlikNo: SAHTE_TC, adi: 'Deneme' } });
    expect(servisGetir(vt, servisId)?.ayarlar.alanBaglari?.Teklif).toEqual({ 'Input/CitizenshipNumber': { tablo: turId, sutun: 'tcKimlikNo', etiket: 'musteri' } });
    const once = istekler.length;
    const yeniKosu = await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId });
    expect(yeniKosu.durum, yeniKosu.hata).toBe('basarili');
    expect(istekler[once].govde).toContain(`<CitizenshipNumber>${SAHTE_TC}</CitizenshipNumber>`);
    // Dönüştürülecek parametre kalmadı.
    const tekrar = eskiParametreleriDonustur(vt, projeId, { servisId });
    expect('onizleme' in tekrar && tekrar.onizleme.parametreler).toEqual([]);
    expect(() => eskiParametreleriDonustur(vt, projeId, { servisId, onay: true })).toThrow(/Dönüştürülecek/);
  });
});
