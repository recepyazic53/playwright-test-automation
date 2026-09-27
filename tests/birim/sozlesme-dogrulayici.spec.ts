// KORUMA TESTLERİ — servis sözleşmesi doğrulayıcısı (saf modül; ağ yok): JSON Schema alt kümesi (type, required, properties, items,
// enum, nullable / "null" türü, format, anyOf, allOf), JSON ve SOAP / XML yolları, mesajlarda değer yok, taslak çıkarımı (zorunlu =
// tüm örneklerde var, null görüldüyse null izinli, diziler, tek örnek uyarısı), alan alan düzenleme ve fark; YAML okuyucu, OpenAPI /
// JSON Schema kaynakları ($ref çözümü; dış $ref reddi) ve WSDL yanıt şeması. Örnekler genel e-ticaret alanından.
import { expect, test } from '@playwright/test';
import {
  alanKaldir, alanNullAyarla, alanTipiAyarla, alanZorunluAyarla, jsonDogrula, jsonMetniDogrula, semaAlanlari, semaTemizle, sozlesmeFarki, sozlesmeOzeti,
  soapGovdeOgesi, taslakCikar, xmlAgaciOku, xmlDegeri, xmlDogrula
} from '../../scripts/platform/servisler/sozlesme-dogrulayici.mjs';
import { yamlOku } from '../../scripts/platform/servisler/yaml-okuyucu.mjs';
import { alanlardanSema, jsonSemaOku, openapiOnerisi, openapiOperasyonlari, wsdlDosyalarindanYanit } from '../../scripts/platform/servisler/servis-sozlesmesi.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';

const SIPARIS = semaTemizle({
  type: 'object', required: ['orderId', 'name', 'total'],
  properties: {
    orderId: { type: 'integer' }, name: { type: 'string' }, total: { type: 'number' }, note: { type: ['string', 'null'] },
    status: { enum: ['NEW', 'PAID'] }, createdAt: { type: 'string', format: 'date-time' }, email: { type: 'string', format: 'email' },
    items: { type: 'array', items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, qty: { type: 'integer' } } } }
  }
});

test('JSON: uyumlu yanıt; tür / zorunlu / null / enum / format / dizi uyumsuzlukları yol bazında ve DEĞERSİZ', () => {
  expect(jsonDogrula(SIPARIS, { orderId: 7, name: 'Kalem', total: 12.5, note: null, status: 'NEW', createdAt: '2026-09-28T10:00:00Z', email: 'a@b.co', items: [{ sku: 'K-1', qty: 2 }] }).toplam).toBe(0);
  const r = jsonDogrula(SIPARIS, { orderId: 'gizli-123', total: null, status: 'IPTAL', createdAt: 'dün', email: 'x', items: [{ qty: 1.5 }] });
  expect(r.uyumsuzluklar).toEqual(expect.arrayContaining([
    { yol: 'response.orderId', mesaj: 'tam sayı bekleniyordu, metin geldi' },
    { yol: 'response.name', mesaj: 'zorunlu alan yok' },
    { yol: 'response.total', mesaj: 'null izinli değil' },
    { yol: 'response.status', mesaj: 'izinli değerlerden biri değil (izinli: NEW, PAID)' },
    { yol: 'response.createdAt', mesaj: 'tarih-saat (ISO 8601) biçiminde değil' },
    { yol: 'response.email', mesaj: 'e-posta biçiminde değil' },
    { yol: 'response.items[0].sku', mesaj: 'zorunlu alan yok' },
    { yol: 'response.items[0].qty', mesaj: 'tam sayı bekleniyordu, sayı geldi' }
  ]));
  expect(r.toplam).toBe(8);
  // Mesajlar gelen değeri içermez (gizli değer rapora sızmaz).
  expect(JSON.stringify(r)).not.toContain('gizli-123');
  expect(JSON.stringify(r)).not.toContain('IPTAL');
  // Format denetimi isteğe bağlı; fazla alan uyumsuzluk değildir; sınır: en çok N kayıt, toplam yine sayılır.
  expect(jsonDogrula(SIPARIS, { orderId: 1, name: 'a', total: 1, createdAt: 'dün', ekAlan: true }, { bicimDenetle: false }).toplam).toBe(0);
  const s = jsonDogrula(SIPARIS, {}, { enCok: 1 });
  expect([s.uyumsuzluklar.length, s.toplam]).toEqual([1, 3]);
  expect(jsonMetniDogrula(SIPARIS, '<html>')).toEqual({ uyumsuzluklar: [{ yol: 'response', mesaj: 'yanıt geçerli JSON değil' }], toplam: 1 });
  expect(jsonDogrula(semaTemizle({ type: 'string', nullable: true }), null).toplam).toBe(0);
  expect(jsonDogrula(semaTemizle({ anyOf: [{ type: 'integer' }, { type: 'string' }] }), true).uyumsuzluklar[0].mesaj).toBe('izinli seçeneklerin hiçbiriyle uyuşmuyor');
});

test('şema temizleme: allOf birleşir, bilinmeyen anahtar / tür atılır, çözülmemiş $ref ve bozuk yapı reddedilir', () => {
  const s = semaTemizle({ allOf: [{ type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] }, { properties: { b: { type: 'string', format: 'uuid' } } }], example: { a: 1 } });
  expect(s).toEqual({ type: 'object', properties: { a: { type: 'integer' }, b: { type: 'string' } }, required: ['a'] });
  expect(semaTemizle({ type: 'file' })).toEqual({});
  expect(() => semaTemizle({ properties: { a: { $ref: '#/x' } } })).toThrow('çözülmemiş $ref');
  expect(() => semaTemizle({ properties: { a: 5 } })).toThrow('şema bir nesne olmalı');
});

test('XML / SOAP: yollar XPath biçiminde; xsi:nil null; tekrarlanan öğe dizi (tek öğe de); Fault ve kök denetimi', () => {
  const sema = alanlardanSema([
    { ad: 'SiparisNo', tip: 'tamsayi', zorunlu: true },
    { ad: 'Aciklama', tip: 'metin', nillable: true },
    { ad: 'Kalemler', cocuklar: [{ ad: 'Kalem', coklu: true, zorunlu: true, cocuklar: [{ ad: 'Fiyat', tip: 'ondalik', zorunlu: true }, { ad: 'Adet', tip: 'tamsayi', zorunlu: true }] }] },
    { ad: 'Odendi', tip: 'mantiksal' }, { ad: 'Tarih', tip: 'tarih' }, { ad: 'Durum', secenekler: ['YENI', 'KAPALI'] }
  ]);
  const zarf = (ic: string) => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body><SiparisResponse xmlns="o">${ic}</SiparisResponse></soap:Body></soap:Envelope>`;
  const iyi = zarf('<SiparisNo>42</SiparisNo><Aciklama xsi:nil="true"/><Kalemler><Kalem><Fiyat>9.90</Fiyat><Adet>1</Adet></Kalem></Kalemler><Odendi>true</Odendi><Tarih>2026-09-28</Tarih><Durum>YENI</Durum>');
  expect(xmlDogrula(sema, iyi, { xmlKok: 'SiparisResponse' }).toplam).toBe(0);
  const kotu = zarf('<SiparisNo>A-42</SiparisNo><Kalemler><Kalem><Fiyat>ucuz</Fiyat><Adet>1</Adet></Kalem><Kalem><Fiyat>1</Fiyat></Kalem></Kalemler><Odendi>belki</Odendi><Durum>SILINDI</Durum>');
  const r = xmlDogrula(sema, kotu, { xmlKok: 'SiparisResponse' });
  expect(r.uyumsuzluklar).toEqual(expect.arrayContaining([
    { yol: '/SiparisResponse/SiparisNo', mesaj: 'tam sayı bekleniyordu, metin geldi' },
    { yol: '/SiparisResponse/Kalemler/Kalem[1]/Fiyat', mesaj: 'sayı bekleniyordu, metin geldi' },
    { yol: '/SiparisResponse/Kalemler/Kalem[2]/Adet', mesaj: 'zorunlu alan yok' },
    { yol: '/SiparisResponse/Odendi', mesaj: 'evet/hayır bekleniyordu, metin geldi' }
  ]));
  expect(JSON.stringify(r)).not.toMatch(/A-42|ucuz|belki|SILINDI/);
  expect(xmlDogrula(semaTemizle({ type: 'object', properties: { SiparisNo: { type: 'integer' } } }), zarf('<SiparisNo xsi:nil="true"/>')).uyumsuzluklar[0])
    .toEqual({ yol: '/SiparisResponse/SiparisNo', mesaj: 'null izinli değil' });
  expect(xmlDogrula(sema, iyi, { xmlKok: 'BaskaResponse' }).uyumsuzluklar[0].mesaj).toBe('kök öğe BaskaResponse bekleniyordu, SiparisResponse geldi');
  const fault = '<s:Envelope xmlns:s="x"><s:Body><s:Fault><faultstring>hata</faultstring></s:Fault></s:Body></s:Envelope>';
  expect(xmlDogrula(sema, fault).uyumsuzluklar[0].mesaj).toContain('SOAP hatası (Fault)');
  expect(xmlDogrula(sema, 'düz metin <a>').uyumsuzluklar[0].mesaj).toBe('yanıt okunabilir bir XML değil');
});

test('taslak: tür, zorunlu = tüm örneklerde var, null görüldüyse null izinli, diziler; tek örnek uyarısı', () => {
  const t = taslakCikar([
    { orderId: 1, name: 'a', note: null, createdAt: '2026-09-28T10:00:00Z', items: [{ sku: 'x', qty: 1 }], total: 3 },
    { orderId: 2, name: 'b', note: 'hızlı', createdAt: '2026-09-27T09:00:00Z', items: [{ sku: 'y' }], total: 2.5 }
  ]);
  expect(t.uyarilar).toEqual([]);
  expect(t.sema).toEqual({
    type: 'object', required: ['orderId', 'name', 'note', 'createdAt', 'items', 'total'],
    properties: {
      orderId: { type: 'integer' }, name: { type: 'string' }, note: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' },
      items: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, qty: { type: 'integer' } }, required: ['sku'] } }, total: { type: 'number' }
    }
  });
  const tek = taslakCikar([{ a: 1, bos: [] }]);
  expect(tek.uyarilar[0]).toContain('Tek örnekten zorunluluk kesin değildir');
  expect(tek.uyarilar).toContain('response.bos: dizi hep boş; öğe türü bilinmiyor.');
  // XML: tekrarlanan öğe dizi, sayı biçimli metin sayı; öncü sıfırlı değer metin kalır.
  const kok = xmlAgaciOku('<R><No>5</No><Kod>007</Kod><K><F>1.5</F></K><K><F>2</F></K></R>');
  const tx = taslakCikar([xmlDegeri(soapGovdeOgesi(kok!).dugum!)], { xml: true, kok: '/R' });
  expect(tx.sema.properties).toEqual({ No: { type: 'integer' }, Kod: { type: 'string' }, K: { type: 'array', items: { type: 'object', properties: { F: { type: 'number' } }, required: ['F'] } } });
  expect(() => taslakCikar([])).toThrow('en az bir örnek');
});

test('alan alan düzenleme: tür, zorunlu, null izni, kaldır; özet ve fark', () => {
  const s = JSON.parse(JSON.stringify(SIPARIS));
  const satirlar = semaAlanlari(s);
  expect(satirlar[0]).toMatchObject({ parcalar: [], tip: 'object' });
  expect(satirlar.find((x) => x.yol === 'items[].sku')).toMatchObject({ zorunlu: true, tip: 'string' });
  alanTipiAyarla(s, ['orderId'], 'string');
  alanNullAyarla(s, ['total'], true);
  alanZorunluAyarla(s, ['name'], false);
  alanKaldir(s, ['email']);
  expect(s.properties.orderId).toEqual({ type: 'string' });
  expect(s.properties.total.type).toEqual(['number', 'null']);
  expect(s.required).toEqual(['orderId', 'total']);
  expect(s.properties.email).toBeUndefined();
  expect(jsonDogrula(s, { orderId: 'A1', total: null }).toplam).toBe(0);
  expect(sozlesmeOzeti(SIPARIS)).toEqual({ alanSayisi: 11, zorunluSayisi: 4 });
  expect(sozlesmeFarki(SIPARIS, s)).toEqual({ eklenen: [], kaldirilan: ['email'], degisen: ['orderId', 'name', 'total'] });
});

test('YAML okuyucu: eşleme, dizi, "- anahtar:" satırı, tırnak, akış biçimi, blok metin, yorum; çapa reddedilir', () => {
  const y = yamlOku(`a: 1 # yorum
b: 'x: y'
c: "t\\u00fcr"
liste:
- bir
- { ad: iki, sayi: 2 }
nesne:
  - ad: uc
    etiket: [a, b]
metin: |
  satır 1
  satır 2
katli: >-
  bir
  iki
bos:
`);
  expect(y).toEqual({ a: 1, b: 'x: y', c: 'tür', liste: ['bir', { ad: 'iki', sayi: 2 }], nesne: [{ ad: 'uc', etiket: ['a', 'b'] }], metin: 'satır 1\nsatır 2\n', katli: 'bir iki', bos: null });
  expect(() => yamlOku('a: &x 1\nb: *x')).toThrow('çapa');
});

const OPENAPI = `openapi: 3.0.1
info: { title: Magaza API, version: '1' }
paths:
  /orders/{id}:
    get:
      operationId: siparisGetir
      responses:
        '200':
          description: tamam
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Order' }
        '404': { description: yok }
  /orders:
    post:
      responses:
        '201': { $ref: '#/components/responses/Olustu' }
  /health:
    get:
      responses:
        '204': { description: bos }
  /dis:
    get:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: 'https://ornek.invalid/sema.json' }
components:
  responses:
    Olustu:
      content:
        application/json:
          schema: { type: object, required: [orderId], properties: { orderId: { type: integer } } }
  schemas:
    Order:
      type: object
      required: [orderId, total]
      properties:
        orderId: { type: integer }
        total: { type: number, nullable: true }
        parent: { $ref: '#/components/schemas/Order' }
`;

test('OpenAPI (YAML): yalnız başarılı yanıt şemaları, belge içi $ref (yanıt dahil), döngü "herhangi", dış $ref indirilmez; öneri', () => {
  const o = openapiOperasyonlari(OPENAPI);
  expect(o.baslik).toBe('Magaza API');
  const bul = (a: string) => o.operasyonlar.find((x) => x.anahtar === a)!;
  expect(bul('GET /orders/{id}')).toMatchObject({ operationId: 'siparisGetir', durumKodu: '200' });
  expect(bul('GET /orders/{id}').sema).toEqual({ type: 'object', required: ['orderId', 'total'], properties: { orderId: { type: 'integer' }, total: { type: 'number', nullable: true }, parent: {} } });
  expect(bul('GET /orders/{id}').uyarilar[0]).toContain('Döngüsel başvuru');
  expect(bul('POST /orders').sema).toEqual({ type: 'object', required: ['orderId'], properties: { orderId: { type: 'integer' } } });
  expect(bul('GET /health').hata).toContain('JSON şeması yok');
  expect(bul('GET /dis').hata).toContain('Dış $ref desteklenmez (indirme yapılmaz)');
  expect(openapiOnerisi(o.operasyonlar, { ad: 'getir', metot: 'GET', yol: '/api/orders/${id}' })).toBe('GET /orders/{id}');
  expect(openapiOnerisi(o.operasyonlar, { ad: 'siparisGetir', metot: 'POST', yol: '/x' })).toBe('GET /orders/{id}');
  expect(() => openapiOperasyonlari('{"a":1}')).toThrow('OpenAPI / Swagger belgesi değil');
  // Swagger 2 (JSON): responses.schema + #/definitions.
  const s2 = openapiOperasyonlari(JSON.stringify({ swagger: '2.0', paths: { '/u': { get: { responses: { 200: { schema: { $ref: '#/definitions/U' } } } } } }, definitions: { U: { type: 'object', properties: { ad: { type: 'string' } } } } }));
  expect(s2.operasyonlar[0].sema).toEqual({ type: 'object', properties: { ad: { type: 'string' } } });
});

test('JSON Schema dosyası: #/definitions ve #/$defs çözülür; WSDL yanıt öğesi alan ağacından sözleşmeye', () => {
  const j = jsonSemaOku(JSON.stringify({ $defs: { K: { type: 'object', properties: { f: { type: 'number' } } } }, type: 'object', properties: { k: { $ref: '#/$defs/K' } } }));
  expect(j.sema).toEqual({ type: 'object', properties: { k: { type: 'object', properties: { f: { type: 'number' } } } } });
  expect(() => jsonSemaOku('[1]')).toThrow('nesne olmalı');
  const wsdl = `<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="M" targetNamespace="M">
  <wsdl:types><s:schema targetNamespace="M">
    <s:element name="Getir"><s:complexType><s:sequence><s:element name="No" type="s:int"/></s:sequence></s:complexType></s:element>
  </s:schema></wsdl:types>
  <wsdl:message name="GetirIn"><wsdl:part name="p" element="tns:Getir"/></wsdl:message>
  <wsdl:message name="GetirOut"><wsdl:part name="p" element="tns:GetirResponse"/></wsdl:message>
  <wsdl:portType name="P"><wsdl:operation name="Getir"><wsdl:input message="tns:GetirIn"/><wsdl:output message="tns:GetirOut"/></wsdl:operation></wsdl:portType>
  <wsdl:binding name="B" type="tns:P"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/><wsdl:operation name="Getir"><soap:operation soapAction="M/Getir"/></wsdl:operation></wsdl:binding></wsdl:definitions>`;
  const xsd = `<s:schema xmlns:s="http://www.w3.org/2001/XMLSchema" targetNamespace="M"><s:element name="GetirResponse"><s:complexType><s:sequence>
    <s:element name="Tutar" type="s:decimal" nillable="true"/><s:element minOccurs="0" maxOccurs="unbounded" name="Etiket" type="s:string"/></s:sequence></s:complexType></s:element></s:schema>`;
  expect(wsdlSemalari(wsdl).Getir.yanit).toBeUndefined();
  expect(() => wsdlDosyalarindanYanit([wsdl], 'Getir')).toThrow('yanıt şeması bulunamadı');
  const y = wsdlDosyalarindanYanit([wsdl, xsd], 'Getir');
  expect(y.kok).toBe('GetirResponse');
  expect(alanlardanSema(y.alanlar)).toEqual({ type: 'object', required: ['Tutar'], properties: { Tutar: { type: ['number', 'null'] }, Etiket: { type: 'array', items: { type: 'string' } } } });
});
