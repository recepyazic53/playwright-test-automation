// Servis sözleşmesi ve yetki hatası (401 / 403) testleri için YEREL SAHTE servis (yalnız 127.0.0.1; genel e-ticaret örnekleri).
// - SOAP: GET /Magaza/servis.asmx?wsdl → yanıt öğesi tanımlı WSDL; POST gövdesinde <Mod>iyi</Mod> → sözleşmeye uyan yanıt, <Mod>kotu</Mod> →
//   uymayan yanıt (SiparisNo metin, Tutar yok, Kalem[2]/Adet yok).
// - REST: GET /api/siparis/1 → uyan JSON; GET /api/siparis/2 → uymayan JSON (orderId metin, total null, name yok).
// - Yetki: POST /api/giris → {"token":"tok-N"} (N her girişte artar); GET /api/guvenli → yalnız son token (Bearer tok-N) kabul, değilse 401;
//   "reddet" sayacı > 0 iken /api/guvenli token'a bakmadan 401 döner (sayaç azalır); GET /api/hep401 → her zaman 401; GET /api/hep403 → 403.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const GIZLI_DEGER = 'gizli-deger-77';

export const MAGAZA_WSDL = `<?xml version="1.0"?><wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="Magaza" targetNamespace="Magaza">
  <wsdl:types><s:schema elementFormDefault="qualified" targetNamespace="Magaza">
    <s:element name="SiparisGetir"><s:complexType><s:sequence><s:element minOccurs="0" maxOccurs="1" name="Mod" type="s:string"/></s:sequence></s:complexType></s:element>
    <s:element name="SiparisGetirResponse"><s:complexType><s:sequence>
      <s:element minOccurs="1" maxOccurs="1" name="SiparisNo" type="s:int"/>
      <s:element minOccurs="1" maxOccurs="1" name="Tutar" nillable="true" type="s:decimal"/>
      <s:element minOccurs="0" maxOccurs="1" name="Kalemler" type="tns:KalemListesi"/>
    </s:sequence></s:complexType></s:element>
    <s:complexType name="KalemListesi"><s:sequence><s:element minOccurs="0" maxOccurs="unbounded" name="Kalem" type="tns:Kalem"/></s:sequence></s:complexType>
    <s:complexType name="Kalem"><s:sequence><s:element minOccurs="1" maxOccurs="1" name="Urun" type="s:string"/><s:element minOccurs="1" maxOccurs="1" name="Adet" type="s:int"/></s:sequence></s:complexType>
  </s:schema></wsdl:types>
  <wsdl:message name="SiparisGetirSoapIn"><wsdl:part name="parameters" element="tns:SiparisGetir"/></wsdl:message>
  <wsdl:message name="SiparisGetirSoapOut"><wsdl:part name="parameters" element="tns:SiparisGetirResponse"/></wsdl:message>
  <wsdl:portType name="MagazaSoap"><wsdl:operation name="SiparisGetir"><wsdl:input message="tns:SiparisGetirSoapIn"/><wsdl:output message="tns:SiparisGetirSoapOut"/></wsdl:operation></wsdl:portType>
  <wsdl:binding name="MagazaSoap" type="tns:MagazaSoap"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
  <wsdl:operation name="SiparisGetir"><soap:operation soapAction="Magaza/SiparisGetir" style="document"/></wsdl:operation></wsdl:binding></wsdl:definitions>`;

const soapYaniti = (ic: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body><SiparisGetirResponse xmlns="Magaza">${ic}</SiparisGetirResponse></soap:Body></soap:Envelope>`;
export const IYI_SOAP = soapYaniti('<SiparisNo>42</SiparisNo><Tutar xsi:nil="true"/><Kalemler><Kalem><Urun>Defter</Urun><Adet>2</Adet></Kalem><Kalem><Urun>Kalem</Urun><Adet>1</Adet></Kalem></Kalemler>');
export const KOTU_SOAP = soapYaniti(`<SiparisNo>${GIZLI_DEGER}</SiparisNo><Kalemler><Kalem><Urun>Defter</Urun><Adet>2</Adet></Kalem><Kalem><Urun>Kalem</Urun></Kalem></Kalemler>`);
export const soapIstegi = (mod: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><SiparisGetir xmlns="Magaza"><Mod>${mod}</Mod></SiparisGetir></s:Body></s:Envelope>`;
export const IYI_JSON = { orderId: 1, name: 'Defter', total: 12.5, note: null, items: [{ sku: 'D-1', qty: 2 }] };
export const KOTU_JSON = { orderId: GIZLI_DEGER, total: null, items: [{ qty: 1 }] };

export type SahteKayit = { yontem: string; yol: string; govde: string; yetki: string };
export type SahteMagaza = { adres: string; istekler: SahteKayit[]; durum: { token: number; reddet: number }; kapat: () => Promise<void>; sayi: (yol: string) => number };

export async function sahteMagaza(): Promise<SahteMagaza> {
  const istekler: SahteKayit[] = [];
  const durum = { token: 0, reddet: 0 };
  const sunucu: Server = createServer((req, res) => {
    let govde = '';
    req.setEncoding('utf8');
    req.on('data', (p) => { govde += p; });
    req.on('end', () => {
      const yol = req.url ?? '';
      istekler.push({ yontem: req.method ?? '', yol, govde, yetki: String(req.headers.authorization ?? '') });
      const json = (kod: number, v: unknown) => { res.writeHead(kod, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
      if (req.method === 'GET' && /^\/Magaza\/servis\.asmx\?wsdl$/i.test(yol)) { res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end(MAGAZA_WSDL); return; }
      if (req.method === 'POST' && yol.startsWith('/Magaza/servis.asmx')) {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
        res.end(govde.includes('<Mod>kotu</Mod>') ? KOTU_SOAP : IYI_SOAP);
        return;
      }
      if (yol === '/api/siparis/1') { json(200, IYI_JSON); return; }
      if (yol === '/api/siparis/2') { json(200, KOTU_JSON); return; }
      if (req.method === 'POST' && yol === '/api/giris') { durum.token++; json(200, { token: `tok-${durum.token}` }); return; }
      if (yol === '/api/guvenli') {
        if (durum.reddet > 0) { durum.reddet--; json(401, { hata: 'yetkisiz' }); return; }
        if (req.headers.authorization !== `Bearer tok-${durum.token}`) { json(401, { hata: 'yetkisiz' }); return; }
        json(200, { tamam: true });
        return;
      }
      if (yol === '/api/hep401') { json(401, { hata: 'yetkisiz' }); return; }
      if (yol === '/api/hep403') { json(403, { hata: 'yasak' }); return; }
      res.writeHead(404); res.end('yok');
    });
  });
  await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', () => r()));
  const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  return { adres, istekler, durum, sayi: (y) => istekler.filter((x) => x.yol === y).length, kapat: () => new Promise<void>((r) => sunucu.close(() => r())) };
}
