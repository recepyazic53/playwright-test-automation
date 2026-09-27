// KORUMA TESTLERİ — servis akışı motoru (1. aşama): ${akis:Ad} değerleri (gövde, HTTP başlığı, kontrol), yanıttan değer okuma
// (xml / json / başlık), ek HTTP başlıkları (Authorization: Bearer …; satır sonu reddedilir, Content-Type / SOAPAction ezilemez),
// gizli değerlerin (token) kayıtta ve dönüşte maskelenmesi. Yalnız yerel sahte SOAP sunucusu.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { senaryoIceriginiDogrula, servisKosusuGetir } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { degerOku, kullanilanAkisDegerleri, kullanilanParametreler, xmlAgaci, xpathMetni, yerTutuculariDoldur } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

const PAROLA = 'Gecici-Akis-Motoru-1';
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;

test('${akis:Ad}: parametre listesine girmez; gövdede XML kaçışlı, başlıkta olduğu gibi; tanımsızsa açık hata; başlıkta satır sonu reddedilir', () => {
  const govde = '<T>${akis:Token}</T><K>${Kişi.TC}</K><D>${tarih:bugun|yyyy}</D>';
  expect(kullanilanParametreler(govde)).toEqual(['Kişi.TC']);
  expect(kullanilanAkisDegerleri(govde)).toEqual(['Token']);
  expect(yerTutuculariDoldur(govde, { degerler: { 'Kişi.TC': '1' }, akisDegerleri: { Token: 'a<b' }, simdi: new Date(2026, 0, 1) })).toBe('<T>a&lt;b</T><K>1</K><D>2026</D>');
  expect(yerTutuculariDoldur('Bearer ${akis:Token}', { degerler: {}, akisDegerleri: { Token: 'a<b' }, kacis: 'baslik' })).toBe('Bearer a<b');
  expect(() => yerTutuculariDoldur('${akis:Token}', { degerler: {} })).toThrow('akis:Token (akış değeri: yalnız servis akışında ya da oturum akışıyla dolar)');
  expect(() => yerTutuculariDoldur('Bearer ${akis:T}', { degerler: {}, akisDegerleri: { T: 'x\r\nX-Kotu: 1' }, kacis: 'baslik' })).toThrow('satır sonu');
});

test('yanıttan değer okuma: xml (//A/B, /tam/yol), json (a.b[0].c, $.), başlık (büyük/küçük harf duyarsız); bulunamazsa undefined', () => {
  const xml = '<s:Envelope xmlns:s="x"><s:Body><R><Sonuc><Token>t-1</Token></Sonuc><Diger><Token>t-2</Token></Diger></R></s:Body></s:Envelope>';
  expect(degerOku({ govde: xml }, { yol: '//Diger/Token' })).toBe('t-2');
  expect(degerOku({ govde: xml }, { kaynak: 'xml', yol: '//Token' })).toBe('t-1');
  expect(degerOku({ govde: xml }, { yol: '/Envelope/Body/R/Sonuc/Token' })).toBe('t-1');
  expect(degerOku({ govde: xml }, { yol: '//Yok/Token' })).toBeUndefined();
  expect(xpathMetni(xmlAgaci(xml)!, '//Sonuc/Token')).toBe('t-1');
  const json = JSON.stringify({ veri: { liste: [{ no: 7 }, { no: 8 }], token: 'j-1' } });
  expect(degerOku({ govde: json }, { kaynak: 'json', yol: 'veri.liste[1].no' })).toBe('8');
  expect(degerOku({ govde: json }, { kaynak: 'json', yol: '$.veri.token' })).toBe('j-1');
  expect(degerOku({ govde: json }, { kaynak: 'json', yol: 'veri.yok.x' })).toBeUndefined();
  expect(degerOku({ govde: 'xml değil' }, { kaynak: 'json', yol: 'a' })).toBeUndefined();
  expect(degerOku({ govde: '', basliklar: { 'x-oturum': 'o-1' } }, { kaynak: 'baslik', yol: 'X-Oturum' })).toBe('o-1');
});

test('senaryo başlıkları doğrulanır: HTTP belirteci ad, tek satır değer; Content-Type / SOAPAction verilemez', () => {
  const temel = { operasyon: 'Siparis', govde: '<a/>', kontroller: [] };
  expect(senaryoIceriginiDogrula({ ...temel, basliklar: { Authorization: 'Bearer ${akis:Token}', Bos: '' } }).basliklar).toEqual({ Authorization: 'Bearer ${akis:Token}' });
  expect(() => senaryoIceriginiDogrula({ ...temel, basliklar: { 'Kötü ad': 'x' } })).toThrow('Geçersiz başlık adı');
  expect(() => senaryoIceriginiDogrula({ ...temel, basliklar: { SOAPAction: 'x' } })).toThrow('koşucu tarafından yazılır');
  expect(() => senaryoIceriginiDogrula({ ...temel, basliklar: { A: 'x\ny' } })).toThrow('tek satır');
});

test.describe('akış adımı çağrısı', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('akis-motoru');
  let vt: Veritabani;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let projeId = '';
  let ortamId = '';
  let servisId = '';

  test.beforeAll(async () => {
    soap = await sahteSoapSunucusu();
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Akış projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, ayarlar: { riskli: false } });
    const e = await erisimKontrolu(vt, projeId, { ortamId, yol: '/Servis/ornek.asmx' });
    if (!e.erisilebilir) throw new Error('erişim yok');
    servisId = servisiKaydet(vt, projeId, { anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi });
  });
  test.afterAll(async () => { vt?.kapat(); await soap?.kapat(); klasor.temizle(); });

  test('giriş yanıtından token okunur (gizli: kayıtta ve dönüşte maskeli; açık değer yalnız geri çağırmada); sonraki istekte başlık + gövde + kontrol', async () => {
    let acik: { okunan: Record<string, string>; gizliler: string[] } = { okunan: {}, gizliler: [] };
    const giris = await servisSenaryosuCalistir(vt, projeId, {
      servisId, ortamId, tur: 'dene', taslak: { baslik: 'Giriş', icerik: { operasyon: 'Siparis', govde: zarf('<Giris/>'), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } },
      okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }, { ad: 'Oturum', kaynak: 'baslik', yol: 'x-oturum', gizli: false }, { ad: 'Yok', yol: '//Yok' }],
      akis: { akisBaslik: 'Deneme akışı', adimNo: 1 }, acikDegerler: (d) => { acik = d; }
    });
    expect(acik.okunan).toEqual({ Token: 'tok-1', Oturum: 'oturum-1' });
    expect(giris.durum).toBe('basarisiz');   // "Yok" okunamadı
    expect(giris.kontroller?.map((k) => [k.ad, k.gecti])).toEqual([['Yanıtta geçer: "<Durum>OK</Durum>"', true], ['Değer okundu: Token', true], ['Değer okundu: Oturum', true], ['Değer okunamadı: Yok', false]]);
    expect(giris.okunanlar).toEqual({ Token: '***', Oturum: 'oturum-1' });
    expect(JSON.stringify(giris)).not.toContain('tok-1');
    const kayit = servisKosusuGetir(vt, giris.kosuId);
    expect(JSON.stringify(kayit)).not.toContain('tok-1');
    expect(kayit?.sonuc).toMatchObject({ akis: { akisBaslik: 'Deneme akışı', adimNo: 1 } });

    // Sonraki adım: token başlıkta ve gövdede; kontrolde ${akis:Oturum}; önceki gizliler maskelenir.
    const once = soap.istekler.length;
    const r = await servisSenaryosuCalistir(vt, projeId, {
      servisId, ortamId, tur: 'dene',
      taslak: { baslik: 'Siparis', icerik: { operasyon: 'Siparis', govde: zarf('<Tok>${akis:Token}</Tok><Ot>${akis:Oturum}</Ot>'), basliklar: { Authorization: 'Bearer ${akis:Token}', 'X-Oturum': '${akis:Oturum}', 'Content-Type': 'text/plain' },
        kontroller: [{ tur: 'icermez', deger: '${akis:Oturum}' }] } },
      akisDegerleri: acik.okunan, ekGizliler: acik.gizliler
    }).catch((e: Error) => e);
    // Content-Type senaryoda verilemez (doğrulama).
    expect(String(r)).toContain('koşucu tarafından yazılır');
    const r2 = await servisSenaryosuCalistir(vt, projeId, {
      servisId, ortamId, tur: 'dene',
      taslak: { baslik: 'Siparis', icerik: { operasyon: 'Siparis', govde: zarf('<Tok>${akis:Token}</Tok><Ot>${akis:Oturum}</Ot>'), basliklar: { Authorization: 'Bearer ${akis:Token}', 'X-Oturum': '${akis:Oturum}' },
        kontroller: [{ tur: 'icermez', deger: '${akis:Oturum}' }] } },
      akisDegerleri: acik.okunan, ekGizliler: acik.gizliler
    });
    const istek = soap.istekler.at(-1) as SahteIstek;
    expect(soap.istekler.length).toBe(once + 1);
    expect(istek.basliklar.authorization).toBe('Bearer tok-1');
    expect(istek.basliklar['x-oturum']).toBe('oturum-1');
    expect(istek.basliklar['content-type']).toContain('text/xml');
    expect(istek.govde).toContain('<Tok>tok-1</Tok><Ot>oturum-1</Ot>');
    expect(r2.kontroller?.[0]).toMatchObject({ gecti: true });
    expect(r2.istekBasliklari).toEqual({ Authorization: 'Bearer ***', 'X-Oturum': 'oturum-1' });
    expect(JSON.stringify(r2)).not.toContain('tok-1');
    expect(JSON.stringify(servisKosusuGetir(vt, r2.kosuId))).not.toContain('tok-1');
  });

  test('akış dışında ${akis:…} içeren senaryo açık hatayla düşer (istek atılmaz)', async () => {
    const once = soap.istekler.length;
    const r = await servisSenaryosuCalistir(vt, projeId, {
      servisId, ortamId, tur: 'dene', taslak: { baslik: 'Tek', icerik: { operasyon: 'Siparis', govde: zarf('${akis:Token}'), kontroller: [] } }
    });
    expect(r.durum).toBe('hata');
    expect(r.hata).toContain('akış değeri');
    expect(soap.istekler.length).toBe(once);
  });
});
