// KORUMA TESTLERİ — WSDL içe aktarmaları (Java JAX-WS tarzı servisler): ana WSDL şemayı "?xsd=1", metotları "?wsdl=1" olarak
// ayrı dosyalardan içe aktarır. Denetleme bunları AYNI sunucudan alıp birleştirir; başka sunucuya istek atılmaz.
// Yalnız 127.0.0.1'deki sahte sunucu.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { erisimiDenetle, iceAktarmaAdresleri } from '../../scripts/platform/servisler/soap-istemcisi.mjs';

const TNS = 'http://ws.ornek.test/';
const XSD = `<?xml version="1.0" encoding="UTF-8"?><xs:schema xmlns:tns="${TNS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="${TNS}" version="1.0">
  <xs:element name="getData" type="tns:getData"/><xs:element name="getDataResponse" type="tns:getDataResponse"/>
  <xs:complexType name="getData"><xs:sequence>
    <xs:element name="barkodNo" type="xs:string" minOccurs="0"/><xs:element name="faturaSeriNo" type="xs:string" minOccurs="0"/>
    <xs:element name="sorguTipi" type="tns:sorguTipi"/><xs:element name="tarih" type="xs:dateTime" minOccurs="0"/>
  </xs:sequence></xs:complexType>
  <xs:simpleType name="sorguTipi"><xs:restriction base="xs:string"><xs:enumeration value="FATURA"/><xs:enumeration value="IADE"/></xs:restriction></xs:simpleType>
  <xs:complexType name="getDataResponse"><xs:sequence><xs:element name="return" type="xs:string" minOccurs="0"/></xs:sequence></xs:complexType>
</xs:schema>`;
const ICERIK = (xsd: string) => `<types><xsd:schema><xsd:import namespace="${TNS}" schemaLocation="${xsd}"/></xsd:schema></types>
  <message name="getData"><part name="parameters" element="tns:getData"/></message>
  <message name="getDataResponse"><part name="parameters" element="tns:getDataResponse"/></message>
  <portType name="DataService"><operation name="getData"><input message="tns:getData"/><output message="tns:getDataResponse"/></operation></portType>
  <binding name="DataServicePortBinding" type="tns:DataService"><soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <operation name="getData"><soap:operation soapAction=""/><input><soap:body use="literal"/></input><output><soap:body use="literal"/></output></operation></binding>`;
const KOK = `xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="${TNS}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="${TNS}" name="DataService"`;

test.describe('WSDL içe aktarmaları', () => {
  let sunucu: Server;
  let adres = '';
  const istekler: string[] = [];

  test.beforeAll(async () => {
    sunucu = createServer((req, res) => {
      const yol = req.url ?? '';
      istekler.push(yol);
      const gonder = (m: string) => { res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end(m); };
      // 1) Şema ayrı dosyada (?xsd=1); ayrıca başka sunucuya bir include (izlenmemeli).
      if (yol === '/TEST-DataWS/DataService?wsdl') return gonder(`<?xml version="1.0"?><definitions ${KOK}>${ICERIK(`${adres}/TEST-DataWS/DataService?xsd=1`)}
        <types><xsd:schema><xsd:include schemaLocation="http://baska-sunucu.invalid/dis.xsd"/></xsd:schema></types>
        <service name="DataService"><port name="DataServicePort" binding="tns:DataServicePortBinding"><soap:address location="${adres}/TEST-DataWS/DataService"/></port></service></definitions>`);
      if (yol === '/TEST-DataWS/DataService?xsd=1') return gonder(XSD);
      // 2) Metotlar da ayrı WSDL'de (?wsdl=1), göreli adresle.
      if (yol === '/Ikili/Servis?wsdl') return gonder(`<?xml version="1.0"?><definitions ${KOK}><import namespace="${TNS}" location="Servis?wsdl=1"/>
        <service name="DataService"><port name="P" binding="tns:DataServicePortBinding"><soap:address location="${adres}/Ikili/Servis"/></port></service></definitions>`);
      if (yol === '/Ikili/Servis?wsdl=1') return gonder(`<?xml version="1.0"?><definitions ${KOK}>${ICERIK('Servis?xsd=1')}</definitions>`);
      if (yol === '/Ikili/Servis?xsd=1') return gonder(XSD);
      res.writeHead(404); res.end('yok');
    });
    await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', () => r()));
    adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  });
  test.afterAll(async () => { await new Promise<void>((r) => sunucu.close(() => r())); });

  test('içe aktarma adresleri göreli adrese göre çözülür', () => {
    expect(iceAktarmaAdresleri('<xsd:import schemaLocation="Servis?xsd=1"/><wsdl:import location=\'Servis?wsdl=1\'/><xs:include schemaLocation="a.xsd"/>', 'https://h.test:443/A/Servis?wsdl'))
      .toEqual(['https://h.test/A/Servis?xsd=1', 'https://h.test/A/Servis?wsdl=1', 'https://h.test/A/a.xsd']);
  });

  test('şema ayrı dosyada (?xsd=1): metot ve alanları (seçenek listesi dahil) okunur; başka sunucuya istek atılmaz', async () => {
    istekler.length = 0;
    const e = await erisimiDenetle({ adres: `${adres}/TEST-DataWS/DataService` });
    expect(e.operasyonlar).toEqual([{ ad: 'getData' }]);
    expect(e.iceAktarilan).toBe(1);
    expect(e.semalar.getData.alanlar.map((a) => a.ad)).toEqual(['barkodNo', 'faturaSeriNo', 'sorguTipi', 'tarih']);
    expect(e.semalar.getData.alanlar.find((a) => a.ad === 'sorguTipi')).toMatchObject({ zorunlu: true, secenekler: ['FATURA', 'IADE'] });
    expect(e.semalar.getData.alanlar.find((a) => a.ad === 'tarih')).toMatchObject({ tip: 'tarihSaat' });
    expect(istekler).toEqual(['/TEST-DataWS/DataService?wsdl', '/TEST-DataWS/DataService?xsd=1']);
  });

  test('metotlar da ayrı WSDL\'de (?wsdl=1 → ?xsd=1, göreli adres): iki kat izlenir', async () => {
    istekler.length = 0;
    const e = await erisimiDenetle({ adres: `${adres}/Ikili/Servis` });
    expect(e.operasyonlar).toEqual([{ ad: 'getData' }]);
    expect(e.semalar.getData.alanlar).toHaveLength(4);
    expect(istekler).toEqual(['/Ikili/Servis?wsdl', '/Ikili/Servis?wsdl=1', '/Ikili/Servis?xsd=1']);
  });
});
