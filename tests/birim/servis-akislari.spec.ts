// KORUMA TESTLERİ — servis akışları (kayıt + koşu + oturum): adımlar kayıtlı senaryolara başvurur; bir adımın yanıtından okunan
// değer (token) sonraki adımda ${akis:Token} ile başlıkta / gövdede kullanılır; kalan adımdan sonrakiler atlanır (istek atılmaz);
// ${akis:X} önceki adımda okunmuyorsa akış reddedilir; gizli değer akış ve servis kayıtlarında maskelidir. Oturum akışı servise
// atanınca token koşular arasında süresi dolana kadar bir kez alınır, 401'de ("Token'ı yenile, bir kez tekrar dene" seçiliyse) bir kez yenilenir. Canlıda "yalnız test" adımı olan
// akış istek atmadan reddedilir. Yalnız yerel sahte SOAP sunucusu.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  servisAkisiGetir, servisAkisiKaydet, servisAkisiSil, servisAkislariniListele, servisAkisKosulariniListele, servisAkisKosusuGetir, servisKosulariniListele,
  servisKosusuGetir, servisSenaryosuKaydet
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { oturumlariTemizle, servisAkisiCalistir } from '../../scripts/platform/servisler/servis-akislari.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { govdeCoz, govdeUret } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { SAHTE_TC, WSDL, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

const PAROLA = 'Gecici-Servis-Akisi-1';
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;

test.describe('servis akışları', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('servis-akisi');
  let vt: Veritabani;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let projeId = '';
  let testOrtami = '';
  let canliOrtam = '';
  let servisId = '';
  let giris = '';
  let siparis = '';
  let yetkili = '';
  const girisSayisi = () => soap.istekler.filter((i) => i.govde.includes('<Giris')).length;

  test.beforeAll(async () => {
    soap = await sahteSoapSunucusu();
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Akış projesi' });
    testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, ayarlar: { riskli: false } });
    canliOrtam = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: soap.adres, ayarlar: { canli: true } });
    const e = await erisimKontrolu(vt, projeId, { ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
    if (!e.erisilebilir) throw new Error('erişim yok');
    servisId = servisiKaydet(vt, projeId, { anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi });
    const senaryo = (baslik: string, govde: string, basliklar?: Record<string, string>) => servisSenaryosuKaydet(vt, {
      projeId, servisId, baslik, kapsam: 'ikisi', icerik: { operasyon: 'Siparis', govde: zarf(govde), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }], ...(basliklar ? { basliklar } : {}) }
    });
    giris = senaryo('Giriş', '<Giris/>');
    siparis = senaryo('Siparis', `<IdentityNumber>${SAHTE_TC}</IdentityNumber><Ref>\${akis:Token}</Ref>`, { Authorization: 'Bearer ${akis:Token}' });
    yetkili = senaryo('Yetkili siparis', `<YetkiGerekli/><IdentityNumber>${SAHTE_TC}</IdentityNumber>`, { Authorization: 'Bearer ${akis:Token}' });
  });
  test.afterAll(async () => { vt?.kapat(); await soap?.kapat(); klasor.temizle(); });

  test('kayıt: yapısal doğrulama; içerik diskte şifreli; listele / getir / sil', () => {
    const adimlar = [{ ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }];
    expect(() => servisAkisiKaydet(vt, { projeId, baslik: 'X', icerik: { adimlar: [] } })).toThrow('en az bir adım');
    expect(() => servisAkisiKaydet(vt, { projeId, baslik: 'X', icerik: { adimlar: [{ ...adimlar[0], okumalar: [{ ad: '1kötü', yol: 'a' }] }] } })).toThrow('ad geçersiz');
    expect(() => servisAkisiKaydet(vt, { projeId, baslik: 'X', tur: 'oturum', icerik: { adimlar: [{ ...adimlar[0], okumalar: [] }] } })).toThrow('en az bir değer');
    expect(() => servisAkisiKaydet(vt, { projeId, baslik: 'X', tur: 'oturum', icerik: { adimlar, omurSaniye: 5 } })).toThrow('omurSaniye');
    const id = servisAkisiKaydet(vt, { projeId, baslik: 'Geçici', icerik: { adimlar } });
    expect(servisAkisiGetir(vt, id)?.icerik.adimlar[0]).toEqual({ id: 'adim1', ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', kaynak: 'xml', yol: '//Sonuc/Token' }] });
    const ham = vt.tek('SELECT icerik_json FROM servis_akislari WHERE id = ?', [id]);
    expect(String(ham?.icerik_json)).toMatch(/^kasa:v1:/);
    expect(servisAkislariniListele(vt, projeId).map((a) => a.baslik)).toEqual(['Geçici']);
    expect(servisAkisiSil(vt, id)).toBe(true);
    expect(servisAkislariniListele(vt, projeId)).toEqual([]);
  });

  test('akış: giriş token okur → siparis başlıkta ve gövdede kullanır; kayıtlarda token maskeli; ${akis:X} okunmuyorsa reddedilir', async () => {
    const akisId = servisAkisiKaydet(vt, { projeId, baslik: 'Giriş → Siparis', icerik: { adimlar: [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] },
      { ad: 'Siparis', servisId, senaryoId: siparis }
    ] } });
    const once = soap.istekler.length;
    const r = await servisAkisiCalistir(vt, projeId, { akisId, ortamId: testOrtami, tur: 'dene' });
    expect(r.durum).toBe('basarili');
    expect(r.adimlar.map((a) => [a.ad, a.durum])).toEqual([['Giriş', 'basarili'], ['Siparis', 'basarili']]);
    expect(r.adimlar[0].okunanlar).toEqual({ Token: '***' });
    const [, ikinci] = soap.istekler.slice(once);
    const token = `tok-${girisSayisi()}`;   // son girişte verilen
    expect(ikinci.basliklar.authorization).toBe(`Bearer ${token}`);
    expect(ikinci.govde).toContain(`<Ref>${token}</Ref>`);
    // Akış ve adım kayıtlarında token yok; adımlar servisin koşularında da görünür (akış bilgisiyle).
    expect(JSON.stringify(servisAkisKosusuGetir(vt, r.kosuId))).not.toContain(token);
    const adimKaydi = servisKosusuGetir(vt, String(r.adimlar[1].kosuId));
    expect(JSON.stringify(adimKaydi)).not.toContain(token);
    expect(adimKaydi?.sonuc).toMatchObject({ akis: { akisId, akisBaslik: 'Giriş → Siparis', adimNo: 2 }, istekBasliklari: { Authorization: 'Bearer ***' } });
    expect(servisAkisKosulariniListele(vt, { projeId, akisId }).map((k) => k.durum)).toEqual(['basarili']);
    // Okunmayan değere başvuran akış koşulmaz.
    const bozuk = servisAkisiKaydet(vt, { projeId, baslik: 'Bozuk', icerik: { adimlar: [{ ad: 'Siparis', servisId, senaryoId: siparis }] } });
    await expect(servisAkisiCalistir(vt, projeId, { akisId: bozuk, ortamId: testOrtami, tur: 'dene' })).rejects.toThrow('${akis:Token} önceki adımlarda okunmuyor');
  });

  test('örnek kurgu: 1. adım yanıtındaki OrderNo okunur → 2. adımın gövdesinde (alan formundan "Akıştan") o değer gönderilir', async () => {
    // 1. adım "CreateOrder" gibi: yanıtta <Token> (burada OrderNo yerine) döner. 2. adım "Approve" gibi: gövdedeki alan ${akis:OrderNo}.
    const govde = govdeUret(wsdlSemalari(WSDL).Siparis, { 'Input/IdentityNumber': { kaynak: 'sabit', deger: SAHTE_TC }, 'Input/Channel': { kaynak: 'akis', deger: 'OrderNo' } });
    expect(govde).toContain('<Channel>${akis:OrderNo}</Channel>');
    expect(govdeCoz(govde, wsdlSemalari(WSDL).Siparis).degerler['Input/Channel']).toEqual({ kaynak: 'akis', deger: 'OrderNo' });
    const onay = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Onay (Approve)', kapsam: 'ikisi', icerik: { operasyon: 'Siparis', govde, kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } });
    const once = soap.istekler.length;
    const r = await servisAkisiCalistir(vt, projeId, { taslak: { baslik: 'Siparis → Onay', icerik: { adimlar: [
      { ad: 'Siparis (CreateOrder)', servisId, senaryoId: giris, okumalar: [{ ad: 'OrderNo', yol: '//Sonuc/Token', gizli: false }] },
      { ad: 'Onay (Approve)', servisId, senaryoId: onay }
    ] } }, ortamId: testOrtami, tur: 'dene' });
    expect(r.durum).toBe('basarili');
    const orderNo = r.adimlar[0].okunanlar?.OrderNo;
    expect(orderNo).toMatch(/^tok-\d+$/);   // gizli değil: raporda görünür
    expect(soap.istekler.slice(once)[1].govde).toContain(`<Channel>${orderNo}</Channel>`);
  });

  test('adım kalınca sonrakiler atlanır (istek atılmaz); hataOlursaDevam ile sürer', async () => {
    const adimlar = (devam: boolean) => [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }, { ad: 'Olmayan', yol: '//Yok' }], ...(devam ? { hataOlursaDevam: true } : {}) },
      { ad: 'Siparis', servisId, senaryoId: siparis }
    ];
    let once = soap.istekler.length;
    const r = await servisAkisiCalistir(vt, projeId, { taslak: { baslik: 'Kalan', icerik: { adimlar: adimlar(false) } }, ortamId: testOrtami, tur: 'dene' });
    expect(r.durum).toBe('basarisiz');
    expect(r.adimlar.map((a) => a.durum)).toEqual(['basarisiz', 'atlandi']);
    expect(r.adimlar[0].neden).toContain('Değer okunamadı: Olmayan');
    expect(r.ozet).toContain('1. adım (Giriş)');
    expect(soap.istekler.length).toBe(once + 1);
    once = soap.istekler.length;
    const d = await servisAkisiCalistir(vt, projeId, { taslak: { baslik: 'Devam', icerik: { adimlar: adimlar(true) } }, ortamId: testOrtami, tur: 'dene' });
    expect(d.adimlar.map((a) => a.durum)).toEqual(['basarisiz', 'basarili']);
    expect(soap.istekler.length).toBe(once + 2);
  });

  test('oturum akışı: servise atanır; token koşular arasında bir kez alınır; 401 gelince bir kez yenilenir', async () => {
    oturumlariTemizle();
    const oturum = servisAkisiKaydet(vt, { projeId, baslik: 'Giriş oturumu', tur: 'oturum', icerik: { adimlar: [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }], omurSaniye: 600, yetkiHatasinda: 'yenileVeTekrar' } });
    const normal = servisAkisiKaydet(vt, { projeId, baslik: 'Normal', icerik: { adimlar: [{ ad: 'Giriş', servisId, senaryoId: giris }] } });
    expect(() => servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', oturumAkisi: normal })).toThrow('oturum akışı değil');
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', oturumAkisi: oturum });
    const once = girisSayisi();
    const kos = () => servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId: yetkili });
    const r1 = await kos();
    const r2 = await kos();
    const r3 = await kos();
    expect([r1, r2, r3].map((r) => r.durum)).toEqual(['basarili', 'basarili', 'basarili']);
    expect(girisSayisi()).toBe(once + 1);
    expect([r1.oturum?.durum, r2.oturum?.durum]).toEqual(['alindi', 'onbellek']);
    // Token başka yerden yenilenirse (sunucu eskisini reddeder): 401 → oturum bir kez yenilenir, senaryo geçer.
    await servisSenaryosuCalistir(vt, projeId, { servisId, ortamId: testOrtami, tur: 'dene', senaryoId: giris });
    const r4 = await kos();
    expect(r4.durum).toBe('basarili');
    expect(r4.oturum?.durum).toBe('yenilendi');
    expect(r4.yetkiTekrari?.not).toBe('401 alındı, token yenilendi, tekrar denendi');
    expect(servisKosulariniListele(vt, { servisId }).filter((k) => k.baslik === 'Yetkili siparis').length).toBe(4);   // 401 denemesi kaydedilmez
    expect(JSON.stringify(servisKosusuGetir(vt, r4.kosuId))).not.toMatch(/tok-\d/);
    // Akış adımında da oturum değeri kullanılır (akış Token okumadan).
    const akis = servisAkisiKaydet(vt, { projeId, baslik: 'Oturumlu', icerik: { adimlar: [{ ad: 'Yetkili', servisId, senaryoId: yetkili }] } });
    expect((await servisAkisiCalistir(vt, projeId, { akisId: akis, ortamId: testOrtami, tur: 'dene' })).durum).toBe('basarili');
    // "Her istekte yeniden al": önbellek kullanılmaz, her senaryo çalıştırmasında giriş yapılır.
    servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Giriş oturumu', tur: 'oturum', icerik: { adimlar: [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }], tokenYenileme: 'herIstekte' } });
    expect(servisAkisiGetir(vt, oturum)?.icerik.tokenYenileme).toBe('herIstekte');
    const once2 = girisSayisi();
    const h1 = await kos();
    const h2 = await kos();
    expect([h1.durum, h2.durum, h1.oturum?.durum, h2.oturum?.durum]).toEqual(['basarili', 'basarili', 'alindi', 'alindi']);
    expect(girisSayisi()).toBe(once2 + 2);
    expect(() => servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Giriş oturumu', tur: 'oturum', icerik: { adimlar: [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }], tokenYenileme: 'bazen' } })).toThrow('tokenYenileme');
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', oturumAkisi: null });
  });

  test('canlı: Dene yapılamaz; "yalnız test" operasyonlu akış canlıda istek atmadan reddedilir', async () => {
    const akisId = servisAkisiKaydet(vt, { projeId, baslik: 'Canlı deneme', kapsam: 'ikisi', icerik: { adimlar: [{ ad: 'Giriş', servisId, senaryoId: giris }] } });
    await expect(servisAkisiCalistir(vt, projeId, { akisId, ortamId: canliOrtam, tur: 'dene' })).rejects.toThrow('yalnızca test ortamında');
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', yalnizTestOperasyonlari: ['Siparis'] });
    const once = soap.istekler.length;
    await expect(servisAkisiCalistir(vt, projeId, { akisId, ortamId: canliOrtam, tur: 'kosu' })).rejects.toThrow('akış canlıda koşulamaz');
    expect(soap.istekler.length).toBe(once);
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', yalnizTestOperasyonlari: [] });
  });
});
