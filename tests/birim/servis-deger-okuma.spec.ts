// KORUMA TESTLERİ — servis akışında yanıttan değer okuma (kod bilmeyen kullanıcı için): XML'de ad alanından bağımsız eşleme (önce
// belgedeki tam ad, sonra yerel ad), "Son yanıttan kontrol öner"in yol biçimi (Kalem[2]), JSON yolu aynen, bulunamayınca yanıttaki benzer
// adların yolla önerilmesi (DEĞER YAZILMADAN) ve gizli okumanın maskelenmesi. Ağ yok; yalnız yerel sahte SOAP sunucusu.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisKosusuGetir } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { degerOku, okumaHatasi } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { arananAd, benzerAlanlar, yanitAlanlari } from '../../scripts/platform/servisler/yanit-kontrolleri.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { sahteSoapSunucusu } from './servis-fikstur';

const GIZLI = 'gizli-deger-7Q';
/** Ad alanlı SOAP yanıtı: önekli (ns2:) ve varsayılan ad alanlı öğeler, tekrarlanan kardeşler. */
const SOAP = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>`
  + `<ns2:GirisResponse xmlns:ns2="urn:ornek"><ns2:Sonuc><Token xmlns="urn:ic">t-9</Token><ns2:AuthToken>${GIZLI}</ns2:AuthToken></ns2:Sonuc>`
  + `<Kalem><Kod>A</Kod></Kalem><Kalem><Kod>B</Kod></Kalem><x:Kod xmlns:x="urn:x">X</x:Kod></ns2:GirisResponse></soap:Body></soap:Envelope>`;

test('ad alanlı SOAP: "//Token" öneksiz yazılsa da bulunur; tam yol, önekli yol ve kontrol önerisinin yolu (Kalem[2]) okunur', () => {
  const oku = (yol: string) => degerOku({ govde: SOAP }, { kaynak: 'xml', yol });
  expect(oku('//Token')).toBe('t-9');
  expect(oku('//Sonuc/Token')).toBe('t-9');
  expect(oku('/Envelope/Body/GirisResponse/Sonuc/Token')).toBe('t-9');
  expect(oku('/soap:Envelope/soap:Body/ns2:GirisResponse/ns2:Sonuc/ns2:AuthToken')).toBe(GIZLI);
  // Önek belgedekinden farklı olsa da (yalnız yerel ad eşleşir) eski kayıtlar aynen çalışır.
  expect(oku('/s:Envelope/s:Body/a:GirisResponse/a:Sonuc/Token')).toBe('t-9');
  // Öncelik: tam eşleşme ("x:Kod" belgede birebir var) → yerel ad ("//Kod" ilk Kod'u bulur).
  expect(oku('//x:Kod')).toBe('X');
  expect(oku('//Kod')).toBe('A');
  expect(oku('//Kalem[2]/Kod')).toBe('B');
  // "Son yanıttan kontrol öner"in listelediği her yol aynen okunabilir.
  for (const a of yanitAlanlari(SOAP).alanlar) expect(oku(a.yol), a.yol).toBe(a.deger);
  expect(oku('//Yok')).toBeUndefined();
});

test('JSON yolu biçimi aynen korunur; başlık okuma değişmez', () => {
  const json = JSON.stringify({ veri: { liste: [{ no: 7 }, { no: 8 }], authToken: GIZLI } });
  expect(degerOku({ govde: json }, { kaynak: 'json', yol: 'veri.liste[1].no' })).toBe('8');
  expect(degerOku({ govde: json }, { kaynak: 'json', yol: '$.veri.authToken' })).toBe(GIZLI);
  expect(degerOku({ govde: json }, { kaynak: 'json', yol: 'veri.token' })).toBeUndefined();
  expect(degerOku({ govde: '', basliklar: { 'x-oturum': 'o-1' } }, { kaynak: 'baslik', yol: 'X-Oturum' })).toBe('o-1');
});

test('bulunamayınca öneri: benzer adlar yollarıyla, değer YAZILMADAN; kaynak yanlışsa doğrusu söylenir', () => {
  expect(arananAd('//ns2:Sonuc/Token[2]')).toBe('Token');
  expect(arananAd('$.veri.liste[0].no')).toBe('no');
  const b = benzerAlanlar(SOAP, '//Tokn');
  expect(b.alanlar.map((a) => a.ad)).toEqual(['Token']);
  const m = okumaHatasi({ govde: SOAP }, { kaynak: 'xml', yol: '//Auth' });
  expect(m).toBe('“Auth” bulunamadı (XML yolu "//Auth"); yanıtta şunlar var: AuthToken (/Envelope/Body/GirisResponse/Sonuc/AuthToken). Alanı “Yanıttan seç” ile tıklayarak da seçebilirsiniz.');
  const t = okumaHatasi({ govde: SOAP }, { kaynak: 'xml', yol: '//token' });
  expect(t).toContain('Token (/Envelope/Body/GirisResponse/Sonuc/Token)');
  expect(t).toContain('AuthToken (/Envelope/Body/GirisResponse/Sonuc/AuthToken)');
  // Gizli / maskeli değer hiçbir iletide görünmez (yalnız ad ve yol).
  expect(t).not.toContain(GIZLI);
  expect(t).not.toContain('t-9');
  const json = JSON.stringify({ veri: { authToken: GIZLI } });
  const j = okumaHatasi({ govde: json }, { kaynak: 'xml', yol: '//Token' });
  expect(j).toContain('yanıt JSON, okuma kaynağını “JSON yolu” seçin');
  expect(j).toContain('authToken (veri.authToken)');
  expect(j).not.toContain(GIZLI);
  expect(okumaHatasi({ govde: SOAP }, { yol: '//Zzqqx' })).toContain('yanıtta bu ada benzeyen alan yok');
  expect(okumaHatasi({ govde: 'düz metin' }, { yol: '//Token' })).toContain('XML ya da JSON olarak okunamadı');
  expect(okumaHatasi({ govde: '<a><Token/></a>' }, { yol: '//Token' })).toContain('“Token” yanıtta var ama boş');
  expect(okumaHatasi({ govde: '', basliklar: { 'x-oturum': GIZLI } }, { kaynak: 'baslik', yol: 'x-token' })).toBe('“x-token” başlığı yanıtta yok; yanıttaki başlıklar: x-oturum');
});

test('servis koşusu: okunamayan değerde öneri kayda yazılır; gizli okuma (ad ya da "gizli" işareti) maskeli kalır', async () => {
  test.setTimeout(60_000);
  const soap = await sahteSoapSunucusu();
  const klasor = geciciKlasor('deger-okuma-');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Deger-Okuma-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Okuma Projesi' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, ayarlar: { riskli: false } });
    const e = await erisimKontrolu(vt, projeId, { ortamId, yol: '/Servis/ornek.asmx' });
    if (!e.erisilebilir) throw new Error('erişim yok');
    const servisId = servisiKaydet(vt, projeId, { anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi });
    const govde = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input><Giris/></Input></Siparis></s:Body></s:Envelope>';
    const r = await servisSenaryosuCalistir(vt, projeId, {
      servisId, ortamId, tur: 'dene', taslak: { baslik: 'Giriş', icerik: { operasyon: 'Siparis', govde, kontroller: [] } },
      okumalar: [{ ad: 'Token', yol: '//Token' }, { ad: 'Kod', yol: '//Sonuc/Durum', gizli: true }, { ad: 'Oturum', yol: '//Tokn' }]
    }) as Record<string, any>;
    expect(r.okunanlar).toEqual({ Token: '***', Kod: '***' });
    const k = (r.kontroller as Array<{ ad: string; gecti: boolean; aciklama: string }>).find((x) => x.ad === 'Değer okunamadı: Oturum');
    expect(k?.aciklama).toContain('“Tokn” bulunamadı (XML yolu "//Tokn"); yanıtta şunlar var: Token (/Envelope/Body/GirisResponse/Sonuc/Token)');
    const kayit = JSON.stringify(servisKosusuGetir(vt, String(r.kosuId)));
    expect(kayit).not.toMatch(/tok-\d/);
    expect(kayit).toContain('<Durum>***</Durum>');
  } finally {
    vt.kapat();
    klasor.temizle();
    await soap.kapat();
  }
});
