// Servis senaryo önerileri testleri için SENTETİK şemalar, yardımcılar ve yerel SAHTE SOAP sunucusu (yalnız 127.0.0.1; gerçek servis /
// kurum / kişi yok; değerler SAHTEDİR).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { govdeUret } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import type { AlanDegeri, OperasyonSemasi } from '../../scripts/platform/servisler/servis-govdesi.mjs';

/** Kısıtlı alanlı WSDL (.asmx tarzı): SiparisVer (aralık, uzunluk + desen, liste, evet-hayır, gizli adlı alan, kuralsız alan, doğal aralık,
 * varsayılan) ve DurumSor (zorunlu uzun sayı, liste). */
export const KISITLI_WSDL = `<?xml version="1.0"?><wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="Ornek" targetNamespace="Ornek">
  <wsdl:types><s:schema elementFormDefault="qualified" targetNamespace="Ornek">
    <s:element name="SiparisVer"><s:complexType><s:sequence>
      <s:element minOccurs="1" maxOccurs="1" name="Tutar"><s:simpleType><s:restriction base="s:int"><s:minInclusive value="1"/><s:maxInclusive value="1000"/></s:restriction></s:simpleType></s:element>
      <s:element minOccurs="1" maxOccurs="1" name="Kod" type="tns:KodTipi"/>
      <s:element minOccurs="1" maxOccurs="1" name="Tip" type="tns:SiparisTipi"/>
      <s:element minOccurs="0" maxOccurs="1" name="Kanal" type="tns:KanalTipi"/>
      <s:element minOccurs="0" maxOccurs="1" name="Hediye" type="s:boolean"/>
      <s:element minOccurs="0" maxOccurs="1" name="Parola"><s:simpleType><s:restriction base="s:string"><s:minLength value="8"/></s:restriction></s:simpleType></s:element>
      <s:element minOccurs="0" maxOccurs="1" name="Aciklama" type="s:string"/>
      <s:element minOccurs="0" maxOccurs="1" name="Adet" type="s:positiveInteger"/>
      <s:element minOccurs="0" maxOccurs="1" name="Para" type="s:string" default="TRY"/>
    </s:sequence></s:complexType></s:element>
    <s:simpleType name="KodTipi"><s:restriction base="s:string"><s:maxLength value="5"/><s:pattern value="[A-Z]+"/></s:restriction></s:simpleType>
    <s:simpleType name="SiparisTipi"><s:restriction base="s:string"><s:enumeration value="O"/><s:enumeration value="T"/></s:restriction></s:simpleType>
    <s:simpleType name="KanalTipi"><s:restriction base="s:string"><s:enumeration value="A"/><s:enumeration value="B"/><s:enumeration value="C"/></s:restriction></s:simpleType>
    <s:element name="DurumSor"><s:complexType><s:sequence>
      <s:element minOccurs="1" maxOccurs="1" name="SiparisNo" type="s:long"/>
      <s:element minOccurs="0" maxOccurs="1" name="Dil" type="tns:DilTipi"/>
    </s:sequence></s:complexType></s:element>
    <s:simpleType name="DilTipi"><s:restriction base="s:string"><s:enumeration value="TR"/><s:enumeration value="EN"/></s:restriction></s:simpleType>
  </s:schema></wsdl:types>
  <wsdl:message name="SiparisVerSoapIn"><wsdl:part name="parameters" element="tns:SiparisVer"/></wsdl:message>
  <wsdl:message name="DurumSorSoapIn"><wsdl:part name="parameters" element="tns:DurumSor"/></wsdl:message>
  <wsdl:portType name="OrnekSoap"><wsdl:operation name="SiparisVer"><wsdl:input message="tns:SiparisVerSoapIn"/></wsdl:operation>
    <wsdl:operation name="DurumSor"><wsdl:input message="tns:DurumSorSoapIn"/></wsdl:operation></wsdl:portType>
  <wsdl:binding name="OrnekSoap" type="tns:OrnekSoap"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
  <wsdl:operation name="SiparisVer"><soap:operation soapAction="Ornek/SiparisVer" style="document"/></wsdl:operation>
  <wsdl:operation name="DurumSor"><soap:operation soapAction="Ornek/DurumSor" style="document"/></wsdl:operation></wsdl:binding></wsdl:definitions>`;

export const semalar = (): Record<string, OperasyonSemasi> => wsdlSemalari(KISITLI_WSDL);

/** SiparisVer gövdesi: verilen alanlar sabit değerle (verilmeyenler gönderilmez). */
export function siparisGovdesi(degerler: Record<string, string | AlanDegeri>): string {
  const sema = semalar().SiparisVer;
  return govdeUret(sema, Object.fromEntries(Object.entries(degerler).map(([k, v]) => [k, typeof v === 'string' ? { kaynak: 'sabit', deger: v } : v])));
}

/** OpenAPI 3 belgesi: POST /kayitlar/{id} — yol (tam sayı ≥ 1), sorgu (sayfa 1..100), JSON gövde (ad 2..3 karakter zorunlu, tur enum, e-posta biçimi). */
export const OPENAPI = JSON.stringify({
  openapi: '3.0.0', info: { title: 'Örnek', version: '1' },
  paths: {
    '/kayitlar/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      post: {
        operationId: 'kayitGuncelle',
        parameters: [{ name: 'sayfa', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }, { $ref: '#/components/parameters/Dil' }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Kayit' } } } },
        responses: { 200: { description: 'tamam', content: { 'application/json': { schema: { type: 'object', properties: { durum: { type: 'string' } } } } } } }
      }
    }
  },
  components: {
    parameters: { Dil: { name: 'dil', in: 'query', schema: { type: 'string', enum: ['tr', 'en'] } } },
    schemas: { Kayit: { type: 'object', required: ['ad'], properties: {
      ad: { type: 'string', minLength: 2, maxLength: 3 }, tur: { type: 'string', enum: ['bireysel', 'kurumsal'] }, eposta: { type: 'string', format: 'email' },
      tutar: { type: 'number', exclusiveMinimum: true, minimum: 0 }, token: { type: 'string', minLength: 10 }
    } } }
  }
});

/** Sahte yanıttaki gizli adlı alanın değeri (raporda / kontrolde görünmemeli). */
export const SAHTE_TOKEN = 'tok-gizli-4242';
/** SiparisVer başarılı yanıtı: durum, 8 haneli numara, ondalık tutar, tarih, her koşuda değişen işlem no, gizli adlı alan, tekrar eden kalem. */
export const siparisYaniti = (islemNo: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><SiparisVerResponse xmlns="Ornek"><Sonuc>`
  + `<Durum>BASARILI</Durum><SiparisNo>70012345</SiparisNo><Tutar>1245.50</Tutar><Tarih>2026-09-24</Tarih><IslemNo>${islemNo}</IslemNo><Token>${SAHTE_TOKEN}</Token>`
  + '<Kalemler><Kalem><Kod>K1</Kod></Kalem><Kalem><Kod>K2</Kod></Kalem></Kalemler></Sonuc></SiparisVerResponse></soap:Body></soap:Envelope>';
export const faultYaniti = (m: string) => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Client</faultcode><faultstring>${m}</faultstring></soap:Fault></soap:Body></soap:Envelope>`;

export type SahteSiparisServisi = { adres: string; istekler: Array<{ yontem: string; yol: string; govde: string }>; kapat: () => Promise<void>; postSayisi: () => number };

/**
 * Sahte SOAP sunucusu: GET /Ornek/servis.asmx?wsdl → KISITLI_WSDL; POST → <Tutar> 1000'den büyükse Fault ("Tutar limiti aşıldı"), değilse
 * başarılı sipariş yanıtı (IslemNo her istekte değişir). Gövdede "YAVAS" geçerse yanıt 300 ms gecikir.
 */
export async function sahteSiparisServisi(): Promise<SahteSiparisServisi> {
  const istekler: Array<{ yontem: string; yol: string; govde: string }> = [];
  let sayac = 0;
  const sunucu: Server = createServer((req, res) => {
    let govde = '';
    req.setEncoding('utf8');
    req.on('data', (p) => { govde += p; });
    req.on('end', () => {
      istekler.push({ yontem: req.method ?? '', yol: req.url ?? '', govde });
      if (req.method === 'GET' && /\/Ornek\/servis\.asmx\?wsdl$/i.test(req.url ?? '')) { res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end(KISITLI_WSDL); return; }
      if (req.method === 'POST' && (req.url ?? '').startsWith('/Ornek/servis.asmx')) {
        const tutar = Number(/<Tutar>([^<]*)<\/Tutar>/.exec(govde)?.[1] ?? '0');
        const cevap = () => {
          if (tutar > 1000) { res.writeHead(500, { 'Content-Type': 'text/xml; charset=utf-8' }); res.end(faultYaniti('Tutar limiti aşıldı')); return; }
          res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
          res.end(siparisYaniti(`A-${++sayac}${Date.now() % 1000}`));
        };
        if (govde.includes('YAVAS')) setTimeout(cevap, 300); else cevap();
        return;
      }
      res.writeHead(404); res.end('yok');
    });
  });
  await new Promise<void>((r) => sunucu.listen(0, '127.0.0.1', () => r()));
  const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  return {
    adres, istekler, postSayisi: () => istekler.filter((x) => x.yontem === 'POST').length,
    kapat: () => new Promise<void>((r) => { sunucu.closeAllConnections?.(); sunucu.close(() => r()); })
  };
}
