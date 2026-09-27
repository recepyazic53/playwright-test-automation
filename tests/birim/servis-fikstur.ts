// Servis testleri için SENTETİK SoapUI dosyası ve yerel SAHTE SOAP sunucusu (127.0.0.1; gerçek kanal / kullanıcı / kimlik yok).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const SAHTE_PAROLA = 'sahte-servis-parolasi-9';
export const SAHTE_TC = '12345678901';

export const GROOVY = `import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
def formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
def now = LocalDateTime.now()
def beginDate = now.format(formatter)
def endDate = now.plusYears(1).format(formatter)
def kisaBitis = now.plusDays(60).format(formatter)
def password = "${SAHTE_PAROLA}"
testRunner.testCase.setPropertyValue("BEGIN_DATE", beginDate)
testRunner.testCase.setPropertyValue("END_DATE", endDate)
testRunner.testCase.setPropertyValue("ENDSHORT_DATE", kisaBitis)
testRunner.testCase.setPropertyValue("PASSWORD", password)`.replace(/</g, '&lt;');

const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;
const istekAdimi = (ad: string, govde: string, dogrulamalar: string) => `
      <con:testStep type="request" name="${ad}"><con:config xsi:type="con:RequestStep" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <con:interface>OrnekServiceSoap</con:interface><con:operation>Siparis</con:operation>
        <con:request name="${ad}"><con:endpoint>http://eski-adres.invalid/Servis/ornek.asmx</con:endpoint>
          <con:request><![CDATA[${govde}]]></con:request>${dogrulamalar}
        </con:request></con:config></con:testStep>`;
const SOAP_YANITI = '<con:assertion type="SOAP Response" id="a1"/>';
const icerir = (t: string) => `<con:assertion type="Simple Contains" id="a2" name="Contains"><con:configuration><token>${t.replace(/</g, '&lt;')}</token><ignoreCase>false</ignoreCase><useRegEx>false</useRegEx></con:configuration></con:assertion>`;

export const SOAPUI = `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project id="p" name="Ornek Proje" xmlns:con="http://eviware.com/soapui/config">
  <con:interface xsi:type="con:WsdlInterface" name="OrnekServiceSoap" soapVersion="1_1" definition="http://eski-adres.invalid/Servis/ornek.asmx?wsdl" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <con:operation id="o1" action="Ornek/Siparis" name="Siparis" type="Request-Response"/>
  </con:interface>
  <con:testSuite id="t" name="Takim">
    <con:testCase id="c" name="OrnekDurum">
      <con:testStep type="groovy" name="Tarihler"><con:config><script>${GROOVY}</script></con:config></con:testStep>
      ${istekAdimi('Geçersiz kimlik', zarf(`<Channel>100</Channel><Username>kullanici100</Username><Password>\${#TestCase#PASSWORD}</Password><IdentityNumber>000</IdentityNumber><BeginDate>\${#TestCase#BEGIN_DATE}</BeginDate>`), SOAP_YANITI + icerir('<Durum>HATA</Durum>'))}
      ${istekAdimi('Geçerli kimlik', zarf(`<Channel>100</Channel><Username>kullanici100</Username><Password>\${#TestCase#PASSWORD}</Password><IdentityNumber>\${#TestCase#MUSTERI_TC}</IdentityNumber><EndDate>\${#TestCase#END_DATE}</EndDate>`), SOAP_YANITI + icerir('<Durum>OK</Durum>'))}
      ${istekAdimi('Başka kanal', zarf(`<Channel>999</Channel><Username>kullanici999</Username><IdentityNumber>000</IdentityNumber>`), SOAP_YANITI)}
      <con:testStep type="transfer" name="Aktarım"><con:config/></con:testStep>
      <con:properties><con:property><con:name>MUSTERI_TC</con:name><con:value>55555555555</con:value></con:property></con:properties>
    </con:testCase>
  </con:testSuite>
</con:soapui-project>`;

// ---- Sahte SOAP sunucusu -----------------------------------------------------------------------------------------------

/** .asmx tarzı WSDL: Siparis'in girdisi kalıtımlı karmaşık tip (Channel / Username tabanda), iç içe grup, liste (enumeration). */
export const WSDL = `<?xml version="1.0"?><wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="Ornek" targetNamespace="Ornek">
  <wsdl:types><s:schema elementFormDefault="qualified" targetNamespace="Ornek">
    <s:element name="Siparis"><s:complexType><s:sequence><s:element minOccurs="0" maxOccurs="1" name="Input" type="tns:SiparisGirdisi"/></s:sequence></s:complexType></s:element>
    <s:complexType name="TabanGirdi"><s:sequence>
      <s:element minOccurs="0" maxOccurs="1" name="Channel" type="s:string"/><s:element minOccurs="0" maxOccurs="1" name="Username" type="s:string"/>
      <s:element minOccurs="0" maxOccurs="1" name="Password" type="s:string"/></s:sequence></s:complexType>
    <s:complexType name="SiparisGirdisi"><s:complexContent mixed="false"><s:extension base="tns:TabanGirdi"><s:sequence>
      <s:element minOccurs="0" maxOccurs="1" name="IdentityNumber" type="s:string"/>
      <s:element minOccurs="1" maxOccurs="1" name="BeginDate" type="s:dateTime"/>
      <s:element minOccurs="1" maxOccurs="1" name="EndDate" type="s:dateTime"/>
      <s:element minOccurs="1" maxOccurs="1" name="IsGiftWrap" nillable="true" type="s:boolean"/>
      <s:element minOccurs="0" maxOccurs="1" name="CreditCard" type="tns:Kart"/>
      <s:element minOccurs="1" maxOccurs="1" name="ClientType" type="tns:MusteriTipi"/>
    </s:sequence></s:extension></s:complexContent></s:complexType>
    <s:complexType name="Kart"><s:sequence><s:element minOccurs="0" maxOccurs="1" name="CardNumber" type="s:string"/><s:element minOccurs="1" maxOccurs="1" name="Installment" type="s:int"/></s:sequence></s:complexType>
    <s:simpleType name="MusteriTipi"><s:restriction base="s:string"><s:enumeration value="O"/><s:enumeration value="T"/></s:restriction></s:simpleType>
    <s:element name="Onayla"><s:complexType><s:sequence><s:element minOccurs="1" maxOccurs="1" name="SiparisNo" type="s:long"/></s:sequence></s:complexType></s:element>
  </s:schema></wsdl:types>
  <wsdl:message name="SiparisSoapIn"><wsdl:part name="parameters" element="tns:Siparis"/></wsdl:message>
  <wsdl:message name="OnaylaSoapIn"><wsdl:part name="parameters" element="tns:Onayla"/></wsdl:message>
  <wsdl:portType name="OrnekServiceSoap"><wsdl:operation name="Siparis"><wsdl:input message="tns:SiparisSoapIn"/></wsdl:operation>
    <wsdl:operation name="Onayla"><wsdl:input message="tns:OnaylaSoapIn"/></wsdl:operation></wsdl:portType>
  <wsdl:binding name="OrnekServiceSoap" type="tns:OrnekServiceSoap"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
  <wsdl:operation name="Siparis"><soap:operation soapAction="Ornek/Siparis" style="document"/></wsdl:operation>
  <wsdl:operation name="Onayla"><soap:operation soapAction="Ornek/Onayla" style="document"/></wsdl:operation></wsdl:binding></wsdl:definitions>`;
export const yanit = (durum: string, aciklama: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><SiparisResponse xmlns="Ornek"><Sonuc><Durum>${durum}</Durum><StatusDescription>${aciklama}</StatusDescription></Sonuc></SiparisResponse></soap:Body></soap:Envelope>`;

export type SahteIstek = { yontem: string; yol: string; eylem: string; govde: string; basliklar: Record<string, string> };

/**
 * Sahte SOAP sunucusunu başlatır: GET ?wsdl → WSDL; POST → kimlik ${SAHTE_TC} ise <Durum>OK</Durum>, değilse HATA. Gövdede <Giris>
 * geçerse token yanıtı (<Token>tok-N</Token>, başlık x-oturum: oturum-N; N her girişte artar). <YetkiGerekli/> geçerse yalnız son
 * token kabul edilir (değilse 401).
 */
export async function sahteSoapSunucusu(): Promise<{ adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> }> {
  const istekler: SahteIstek[] = [];
  let girisSayisi = 0;
  const sunucu: Server = createServer((req, res) => {
    let govde = '';
    req.setEncoding('utf8');
    req.on('data', (p) => { govde += p; });
    req.on('end', () => {
      istekler.push({ yontem: req.method ?? '', yol: req.url ?? '', eylem: String(req.headers.soapaction ?? ''), govde,
        basliklar: Object.fromEntries(Object.entries(req.headers).map(([a, v]) => [a, Array.isArray(v) ? v.join(', ') : String(v ?? '')])) });
      if (req.method === 'GET' && /\/Servis\/ornek\.asmx\?wsdl$/i.test(req.url ?? '')) { res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end(WSDL); return; }
      if (req.method === 'POST' && (req.url ?? '').startsWith('/Servis/ornek.asmx')) {
        if (govde.includes('<Giris')) {
          girisSayisi++;
          res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'x-oturum': `oturum-${girisSayisi}` });
          res.end(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GirisResponse xmlns="Ornek"><Sonuc><Token>tok-${girisSayisi}</Token><Durum>OK</Durum></Sonuc></GirisResponse></soap:Body></soap:Envelope>`);
          return;
        }
        // <YetkiGerekli/>: yalnız son verilen token kabul (Authorization: Bearer tok-N), değilse 401.
        if (govde.includes('<YetkiGerekli/>') && req.headers.authorization !== `Bearer tok-${girisSayisi}`) { res.writeHead(401, { 'Content-Type': 'text/plain' }); res.end('yetkisiz'); return; }
        const cevapla = () => {
          if (res.destroyed) return;
          res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
          res.end(govde.includes(`<IdentityNumber>${SAHTE_TC}</IdentityNumber>`) ? yanit('OK', `Kimlik ${SAHTE_TC} kabul`) : yanit('HATA', 'Kimlik geçersiz'));
        };
        // Gövdede "YAVAS" geçerse yanıt 1,5 sn gecikir (canlı panelde "cevap bekleniyor" ve Durdur denenir).
        if (govde.includes('YAVAS')) setTimeout(cevapla, 1500); else cevapla();
        return;
      }
      res.writeHead(404); res.end('yok');
    });
  });
  await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', () => r()));
  const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  return { adres, istekler, kapat: () => new Promise<void>((r) => sunucu.close(() => r())) };
}

