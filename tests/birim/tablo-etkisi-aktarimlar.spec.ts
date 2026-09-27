// KORUMA TESTLERİ — TABLO DEĞERİNİ DEĞİŞTİREN DİĞER YOLLAR DA AYNI ONAYI SORAR (tablolar/tablo-etkisi.mjs etkiDenetimiyle):
//  · SoapUI aktarımı ve Postman aktarımı (var olan satırın değeri dosyadaki değerle değişir), "Test verisine taşı" (aynı adlı profilin
//    değerleri değişir): denetle → hiçbir şey yazılmaz; onayla yalnız seçilen senaryolar güncellenir; "yalnız aktar" senaryolara
//    dokunmaz; "mevcut değerleri koru" dolu hücrenin üzerine yazmaz; tek işlem (hata → aktarım da yazılmaz); etki yoksa eski davranış.
//  · REST servis kaydı: başlık tablosunun gizli değeri değişir ama senaryolar yalnız ${…} başvurusu kullanır (düz metin etkisi yok).
//  · önizleme ('onizle'): yazmaz, seçimlere göre değişir; 'uygula' önizlemedeki etkinin imzasıyla — arada veri değiştiyse yazılmaz.
//  · arayüz (ayrı Nöbetçi 127.0.0.1, geçici veritabanı): SoapUI önizlemesinde "Tabloda değişecek değerler ve etkilenen senaryolar"
//    (seçimle / koru ile değişir; masaüstü + 390px, taşma yok); Aktar pencere açmadan yalnız işaretlileri günceller; arada veri
//    değişirse yazılmaz, güncel etki gösterilip yeniden onay istenir.
// Ağ isteği yok (servisler doğrudan veritabanına yazılır); dosyalar SENTETİKTİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, testVerisiProfiliKaydet, testVerisiTuruKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import {
  servisGetir, servisKaydet, servisKimligiKaydet, servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import { girisProfiliniTestVerisineTasi, postmanAktar, soapuiAktar } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { servisTaslaklari, soapuiCozumle } from '../../scripts/platform/servisler/soapui-ice-aktarma.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { MASKE, etkiDenetimiyle } from '../../scripts/platform/tablolar/tablo-etkisi.mjs';
import { WSDL } from './servis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Nesne = Record<string, any>;

const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Teklif xmlns="Ornek"><Input>${ic}</Input></Teklif></s:Body></s:Envelope>`;
/** Takım özelliği SUBE = 7 (tabloda 5): aktarım var olan satırın değerini değiştirir. */
const SOAPUI = `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project id="p" name="Model Proje" xmlns:con="http://eviware.com/soapui/config">
  <con:interface xsi:type="con:WsdlInterface" name="OrnekServiceSoap" soapVersion="1_1" definition="http://eski-adres.invalid/Servis/ornek.asmx?wsdl" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <con:operation id="o1" action="Ornek/Teklif" name="Teklif" type="Request-Response"/>
  </con:interface>
  <con:testSuite id="t" name="Model Takimi">
    <con:testCase id="c" name="Durum">
      <con:testStep type="request" name="Yeni teklif"><con:config xsi:type="con:RequestStep" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <con:interface>OrnekServiceSoap</con:interface><con:operation>Teklif</con:operation>
        <con:request name="Yeni teklif"><con:endpoint>http://eski-adres.invalid/Servis/ornek.asmx</con:endpoint>
          <con:request><![CDATA[${zarf('<Channel>${#TestSuite#SUBE}</Channel>')}]]></con:request><con:assertion type="SOAP Response" id="a1"/>
        </con:request></con:config></con:testStep>
    </con:testCase>
    <con:properties><con:property><con:name>SUBE</con:name><con:value>7</con:value></con:property></con:properties>
  </con:testSuite>
</con:soapui-project>`;
const TAKIM = { takim: 'Model Takimi', durum: 'Durum' };
const SOAPUI_TABLOSU = 'SoapUI Model Takimi';

/** Postman: kanal değişkeni 101 (tabloda 100). */
const POSTMAN = JSON.stringify({
  info: { name: 'Kanal API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:9/api' }, { key: 'kanal', value: '101' }],
  item: [{ name: 'Kanallar', item: [{ name: 'Kanal ekle', request: { method: 'POST', url: '{{baseUrl}}/kanal', body: { mode: 'raw', raw: '{"kanal":"{{kanal}}"}', options: { raw: { language: 'json' } } } } }] }]
});
const POSTMAN_TABLOSU = 'Postman Kanal API';

interface Kurulum { projeId: string; servisId: string; soapuiTablo: string; postmanTablo: string; girisTur: string; senaryo: Record<string, string> }

/** Proje, SOAP servisi (şema + alan bağları; ağ yok), tablolar ve düz değerli senaryolar. */
function kur(vt: Veritabani): Kurulum {
  const projeId = projeKaydet(vt, { ad: 'Aktarım Projesi' });
  ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true });
  const soapuiTablo = tabloKaydet(vt, { projeId, ad: SOAPUI_TABLOSU, sutunlar: [{ ad: 'SUBE' }], satirlar: [{ ad: 's1', degerler: { SUBE: '5' } }] });
  const postmanTablo = tabloKaydet(vt, { projeId, ad: POSTMAN_TABLOSU, sutunlar: [{ ad: 'kanal' }], satirlar: [{ ad: 'p1', degerler: { kanal: '100' } }] });
  // "Servis girişi" tablosu (CHANNEL → kanal eşlemesi) ve aynı adlı eski profil satırı.
  const girisTur = testVerisiTuruKaydet(vt, { projeId, ad: 'Servis girişi', alanlar: [{ ad: 'kanal', etiket: 'Kanal', tip: 'metin', hassas: false, servisParametreleri: [{ ad: 'CHANNEL', rol: 'giris' }] }] });
  testVerisiProfiliKaydet(vt, { projeId, turId: girisTur, ad: 'ornek-giris', ortamId: null, degerler: { kanal: '300' } });
  const anahtar = servisTaslaklari(soapuiCozumle(SOAPUI), TAKIM).servisler[0].anahtar;
  const servisId = servisKaydet(vt, { projeId, anahtar, ad: 'Ornek', ayarlar: {
    yol: '/Servis/ornek.asmx', operasyonlar: [{ ad: 'Teklif' }], operasyonSemalari: wsdlSemalari(WSDL), kimlikProfili: 'ornek-giris',
    alanBaglari: { Teklif: {
      'Input/Channel': { tablo: soapuiTablo, sutun: 'SUBE' }, 'Input/Username': { tablo: postmanTablo, sutun: 'kanal' }, 'Input/CitizenshipNumber': { tablo: girisTur, sutun: 'kanal' }
    } }
  } });
  servisKimligiKaydet(vt, { projeId, ad: 'ornek-giris', degerler: { CHANNEL: '301' } });
  const senaryo = (baslik: string, ic: string) => servisSenaryosuKaydet(vt, { projeId, servisId, baslik, icerik: { operasyon: 'Teklif', govde: zarf(ic), kontroller: [{ tur: 'soapHatasiYok' }] } });
  return {
    projeId, servisId, soapuiTablo, postmanTablo, girisTur,
    senaryo: {
      sube: senaryo('Şube 5', '<Channel>5</Channel>'), sube2: senaryo('Şube 5 (ikinci)', '<Channel>5</Channel>'),
      kanal: senaryo('Kanal 100', '<Username>100</Username>'), giris: senaryo('Giriş 300', '<CitizenshipNumber>300</CitizenshipNumber>')
    }
  };
}

const deger = (vt: Veritabani, projeId: string, tabloId: string, sutun: string) => tablolariListele(vt, projeId, { tabloId })[0].satirlar[0].degerler[sutun];
const govde = (vt: Veritabani, id: string) => String(servisSenaryosuGetir(vt, id)?.icerik.govde);
const gecmis = (vt: Veritabani, id: string) => Number(vt.tek('SELECT COUNT(*) AS n FROM degisiklik_gecmisi WHERE varlik_id = ?', [id])?.n ?? 0);

test.describe('aktarımlar: etki denetimi (geçici veritabanı)', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let k: Kurulum;
  const soapuiGirdisi = () => ({ xml: SOAPUI, ...TAKIM, servis: servisTaslaklari(soapuiCozumle(SOAPUI), TAKIM).servisler[0].anahtar, ozellikler: { SUBE: 'tablo' } });
  const senaryoSayisi = () => servisSenaryolariniListele(vt, k.servisId).length;

  test.beforeEach(async () => {
    klasor = geciciKlasor('tablo-etkisi-aktarim');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Aktarim-Kasa-Parolasi-9', { kdf: HIZLI_KDF });
    k = kur(vt);
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });

  test('SoapUI: denetle hiçbir şey yazmaz; onayla yalnız seçilen senaryo güncellenir, aktarım aynı işlemde', () => {
    const n = senaryoSayisi();
    const d = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'denetle' });
    if (!d.onayGerekli) throw new Error('onay beklenirdi');
    expect(d.etki.degisiklikler).toEqual([{ tablo: SOAPUI_TABLOSU, satir: 's1', sutun: 'SUBE', gizli: false, eski: '5', yeni: '7' }]);
    expect(d.etki.etkilenenler.map((x) => [x.baslik, x.alan, x.eski, x.yeni])).toEqual([['Şube 5', 'Input/Channel', '5', '7'], ['Şube 5 (ikinci)', 'Input/Channel', '5', '7']]);
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('5');
    expect(senaryoSayisi()).toBe(n);
    const secilen = d.etki.etkilenenler.filter((x) => x.baslik === 'Şube 5').map((x) => x.anahtar);
    const g2 = gecmis(vt, k.senaryo.sube2);
    const r = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'uygula', guncellenecekler: secilen });
    if (r.onayGerekli) throw new Error('onay beklenmezdi');
    expect(r).toMatchObject({ eklenen: 1, guncelleme: { guncellenenSenaryo: 1, atlananlar: [] } });
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('7');
    expect(govde(vt, k.senaryo.sube)).toBe(zarf('<Channel>7</Channel>'));
    expect(govde(vt, k.senaryo.sube2)).toBe(zarf('<Channel>5</Channel>'));
    expect(gecmis(vt, k.senaryo.sube2)).toBe(g2);
    expect(senaryoSayisi()).toBe(n + 1);
  });

  test('SoapUI önizleme: yazmaz, seçimlere göre değişir; imza tutarsa uygulanır, arada veri değiştiyse yazılmaz (farkli)', () => {
    const n = senaryoSayisi();
    const o = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'onizle' });
    expect(o.onizleme).toBe(true);
    expect(o.etki.degisiklikler).toHaveLength(1);
    expect(o.etki.etkilenenler).toHaveLength(2);
    expect(o.etki.imza).toMatch(/^[0-9a-f]{32}$/);
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('5');
    expect(senaryoSayisi()).toBe(n);
    // Seçime göre: gövdede bırak → tabloya yazılmaz; koru → değer değişmez.
    expect(soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), ozellikler: { SUBE: 'birak' }, etki: 'onizle' }).etki.degisiklikler).toEqual([]);
    expect(soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), mevcutDegerleriKoru: true, etki: 'onizle' }).etki.degisiklikler).toEqual([]);
    // Arada tablo değişti (5 → 6): önizlemenin imzası tutmaz → hiçbir şey yazılmaz, güncel etki döner.
    const satirId = tablolariListele(vt, k.projeId, { tabloId: k.soapuiTablo })[0].satirlar[0].id;
    tabloKaydet(vt, { projeId: k.projeId, id: k.soapuiTablo, ad: SOAPUI_TABLOSU, sutunlar: [{ ad: 'SUBE', eskiAd: 'SUBE' }], satirlar: [{ id: satirId, degerler: { SUBE: '6' } }] });
    const f = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'uygula', guncellenecekler: o.etki.etkilenenler.map((x) => x.anahtar), beklenenImza: o.etki.imza });
    if (!f.onayGerekli) throw new Error('fark beklenirdi');
    expect(f.farkli).toBe(true);
    expect(f.etki.degisiklikler[0]).toMatchObject({ eski: '6', yeni: '7' });
    expect(f.etki.etkilenenler).toEqual([]);
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('6');
    expect(senaryoSayisi()).toBe(n);
    // Güncel imzayla: yazılır.
    const r = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'uygula', guncellenecekler: [], beklenenImza: f.etki.imza });
    if (r.onayGerekli) throw new Error('onay beklenmezdi');
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('7');
    expect(senaryoSayisi()).toBe(n + 1);
  });

  test('SoapUI: yalnız aktar senaryolara dokunmaz; mevcut değerleri koru üzerine yazmaz; etki yoksa (etki verilmeden) eski davranış', () => {
    const yalniz = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'uygula', guncellenecekler: [] });
    expect(yalniz).toMatchObject({ eklenen: 1, guncelleme: { guncellenenSenaryo: 0 } });
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('7');
    expect(govde(vt, k.senaryo.sube)).toBe(zarf('<Channel>5</Channel>'));
    // Koru: tabloyu 5'e geri al, aynı dosya ikinci adla → dolu hücre korunur, onay istenmez.
    tabloKaydet(vt, { projeId: k.projeId, id: k.soapuiTablo, ad: SOAPUI_TABLOSU, sutunlar: [{ ad: 'SUBE', eskiAd: 'SUBE' }], satirlar: [{ id: tablolariListele(vt, k.projeId, { tabloId: k.soapuiTablo })[0].satirlar[0].id, degerler: { SUBE: '5' } }] });
    const ikinci = SOAPUI.replace(/Yeni teklif/g, 'Yeni teklif 2');
    const koru = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), xml: ikinci, etki: 'denetle', mevcutDegerleriKoru: true });
    expect(koru.onayGerekli).toBeUndefined();
    expect(koru.etki.degisiklikler).toEqual([]);
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('5');
    // Etki verilmeden (eski çağıranlar): doğrudan yazılır, güncelleme yok.
    const ucuncu = SOAPUI.replace(/Yeni teklif/g, 'Yeni teklif 3');
    const eski = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), xml: ucuncu });
    expect(eski.guncelleme).toBeUndefined();
    expect(eski.etki.degisiklikler).toHaveLength(1);
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('7');
    expect(govde(vt, k.senaryo.sube)).toBe(zarf('<Channel>5</Channel>'));
  });

  test('SoapUI: tek işlem — senaryo yazımında hata → tablo değeri de yeni senaryo da yazılmaz', () => {
    const n = senaryoSayisi();
    const d = soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'denetle' });
    const anahtarlar = d.etki.etkilenenler.map((x) => x.anahtar);
    let cagri = 0;
    // Koşu denetimi planda bir kez, yazımdan önce ikinci kez çağrılır: ikinci senaryonun yazımında hata.
    const servisKosuyorMu = (id: string) => { if (id === k.senaryo.sube2 && ++cagri === 2) throw new Error('yazım hatası (test)'); return false; };
    expect(() => soapuiAktar(vt, k.projeId, { ...soapuiGirdisi(), etki: 'uygula', guncellenecekler: anahtarlar }, { servisKosuyorMu })).toThrow('yazım hatası (test)');
    expect(deger(vt, k.projeId, k.soapuiTablo, 'SUBE')).toBe('5');
    expect(govde(vt, k.senaryo.sube)).toBe(zarf('<Channel>5</Channel>'));
    expect(senaryoSayisi()).toBe(n);
  });

  test('Postman: denetle yazmaz; onayla seçilen senaryo güncellenir; koru üzerine yazmaz; etki yoksa eski davranış', () => {
    const girdi = { koleksiyon: POSTMAN, klasorler: ['kanallar'], tabloAdi: POSTMAN_TABLOSU };
    const d = postmanAktar(vt, k.projeId, { ...girdi, etki: 'denetle' });
    if (!d.onayGerekli) throw new Error('onay beklenirdi');
    expect(d.etki.degisiklikler).toEqual([{ tablo: POSTMAN_TABLOSU, satir: 'p1', sutun: 'kanal', gizli: false, eski: '100', yeni: '101' }]);
    expect(d.etki.etkilenenler.map((x) => [x.baslik, x.alan])).toEqual([['Kanal 100', 'Input/Username']]);
    expect(deger(vt, k.projeId, k.postmanTablo, 'kanal')).toBe('100');
    expect(tablolariListele(vt, k.projeId).length).toBe(3);
    const koru = postmanAktar(vt, k.projeId, { ...girdi, etki: 'denetle', mevcutDegerleriKoru: true });
    if (koru.onayGerekli) throw new Error('onay beklenmezdi');
    expect(deger(vt, k.projeId, k.postmanTablo, 'kanal')).toBe('100');
    expect(koru.servisler[0]).toMatchObject({ anahtar: 'kanallar', eklenen: 1 });
    // Aynı klasör yeniden: senaryo atlanır, tablo değeri onayla yazılır, seçilen senaryo güncellenir.
    const r = postmanAktar(vt, k.projeId, { ...girdi, etki: 'uygula', guncellenecekler: d.etki.etkilenenler.map((x) => x.anahtar) });
    if (r.onayGerekli) throw new Error('onay beklenmezdi');
    expect(r.guncelleme).toMatchObject({ guncellenenSenaryo: 1, atlananlar: [] });
    expect(deger(vt, k.projeId, k.postmanTablo, 'kanal')).toBe('101');
    expect(govde(vt, k.senaryo.kanal)).toBe(zarf('<Username>101</Username>'));
  });

  test('Test verisine taşı: önizlemede etki (yazmaz); onayda seçim verilmezse onay istenir; seçimle tek işlemde; boş seçim senaryoya dokunmaz', () => {
    const o = girisProfiliniTestVerisineTasi(vt, k.projeId, { ad: 'ornek-giris' });
    if (!('onizleme' in o)) throw new Error('önizleme beklenirdi');
    expect(o.onizleme.etki.degisiklikler).toEqual([{ tablo: 'Servis girişi', satir: 'ornek-giris', sutun: 'kanal', gizli: false, eski: '300', yeni: '301' }]);
    expect(o.onizleme.etki.etkilenenler.map((x) => x.baslik)).toEqual(['Giriş 300']);
    expect(deger(vt, k.projeId, k.girisTur, 'kanal')).toBe('300');
    expect(servisGetir(vt, k.servisId)?.ayarlar.kimlikProfili).toBe('ornek-giris');
    const d = girisProfiliniTestVerisineTasi(vt, k.projeId, { ad: 'ornek-giris', onay: true });
    expect('onayGerekli' in d && d.onayGerekli).toBe(true);
    expect(servisGetir(vt, k.servisId)?.ayarlar.kimlikProfili).toBe('ornek-giris');
    const r = girisProfiliniTestVerisineTasi(vt, k.projeId, { ad: 'ornek-giris', onay: true, guncellenecekler: o.onizleme.etki.etkilenenler.map((x) => x.anahtar) });
    expect(r).toMatchObject({ tasindi: true, guncelleme: { guncellenenSenaryo: 1 } });
    expect(deger(vt, k.projeId, k.girisTur, 'kanal')).toBe('301');
    expect(govde(vt, k.senaryo.giris)).toBe(zarf('<CitizenshipNumber>301</CitizenshipNumber>'));
    expect(servisGetir(vt, k.servisId)?.ayarlar.kimlikProfili).toBeUndefined();
  });

  test('REST servis kaydı: başlıktaki gizli değer değişir ama senaryolar yalnız ${…} başvurusu kullanır → düz metin etkisi yok', () => {
    const uc = (sir: string) => ({ ad: 'teklif', metot: 'POST', yol: '/teklif', icerikTuru: 'application/json', govdeOrnegi: '{"a":"x"}', basliklar: [{ ad: 'Authorization', deger: `Bearer ${sir}` }] });
    const ilk = restServisiKaydet(vt, k.projeId, { anahtar: 'rest-ornek', ad: 'Rest Örnek', uclar: [uc('eski-sir-1')], senaryolar: ['teklif'] });
    const tablo = tablolariListele(vt, k.projeId).find((x) => x.ad === 'Rest Örnek başlıkları');
    expect(tablo?.sutunlar.map((c) => [c.ad, c.gizli])).toEqual([['Authorization', true]]);
    const r = etkiDenetimiyle(vt, { etki: 'onizle' }, (y) => y.izle(k.projeId, tablo?.id, () => restServisiKaydet(vt, k.projeId, { id: ilk.id, anahtar: 'rest-ornek', ad: 'Rest Örnek', uclar: [uc('yeni-sir-2')] })));
    expect(r.etki.degisiklikler).toEqual([{ tablo: 'Rest Örnek başlıkları', satir: expect.any(String), sutun: 'Authorization', gizli: true, eski: MASKE, yeni: MASKE }]);
    expect(r.etki.etkilenenler).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/eski-sir-1|yeni-sir-2/);
    // Başlık senaryoya başvuru olarak yazılmıştır (düz değer değil).
    expect(JSON.stringify(servisGetir(vt, ilk.id)?.ayarlar.operasyonlar)).toContain('Bearer ${Rest Örnek başlıkları.Authorization}');
  });

  test('Test verisine taşı: "yalnız taşı" (boş seçim) senaryoya dokunmaz', () => {
    const r = girisProfiliniTestVerisineTasi(vt, k.projeId, { ad: 'ornek-giris', onay: true, guncellenecekler: [] });
    expect(r).toMatchObject({ tasindi: true, guncelleme: { guncellenenSenaryo: 0 } });
    expect(deger(vt, k.projeId, k.girisTur, 'kanal')).toBe('301');
    expect(govde(vt, k.senaryo.giris)).toBe(zarf('<CitizenshipNumber>300</CitizenshipNumber>'));
  });
});

test.describe('arayüz: SoapUI aktarım önizlemesinde etki', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Aktarim-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let k: Kurulum;
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const senaryolar = async () => (await api(`/platform/servis?projeId=${k.projeId}&id=${k.servisId}`)).senaryolar as Nesne[];
  /** Tabloyu API'den (etki denetimi olmadan) değiştirir: önizlemeden sonra veri değişti. */
  const subeYaz = async (deger: string) => {
    const t = ((await api(`/platform/tablolar?projeId=${k.projeId}`)).tablolar as Nesne[]).find((x) => x.id === k.soapuiTablo) as Nesne;
    const y = await api('/platform/tablo/kaydet', { projeId: k.projeId, id: t.id, ad: t.ad, sutunlar: [{ ad: 'SUBE', eskiAd: 'SUBE' }], satirlar: [{ id: t.satirlar[0].id, degerler: { SUBE: deger } }] });
    expect(y.basarili, String(y.mesaj ?? '')).not.toBe(false);
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablo-etkisi-aktarim-arayuz-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    k = kur(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    expect(y.basarili, String(y.mesaj ?? '')).not.toBe(false);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const onizlemeyiAc = async (xml = SOAPUI) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/servisler/yeni');
    await page.getByRole('tab', { name: 'SoapUI dosyasından' }).click();
    await page.getByLabel('SoapUI proje dosyası').setInputFiles({ name: 'proje.xml', mimeType: 'text/xml', buffer: Buffer.from(xml) });
    await page.getByRole('button', { name: 'Seç' }).click();
    const bolum = page.getByRole('region', { name: 'Tabloda değişecek değerler ve etkilenen senaryolar' });
    return { baglam, page, hatalar, bolum };
  };

  test('önizlemede etki: seçimle değişir, koru ile kalkar; işareti kaldırılan yazılmaz; Aktar pencere açmaz (masaüstü + 390px)', async () => {
    test.setTimeout(90_000);
    const { baglam, page, hatalar, bolum } = await onizlemeyiAc();
    // Varsayılan: SUBE servisin bağlı sütununa gider → tabloda değişen değer yok, bölüm gizli.
    await expect(page.getByLabel('SUBE nereden dolsun')).toHaveValue('bag');
    await expect(bolum).toBeHidden();
    // Tabloya → önizlemede değişecek değer ve etkilenen iki senaryo (varsayılan işaretli).
    await page.getByLabel('SUBE nereden dolsun').selectOption('tablo');
    await expect(bolum).toBeVisible();
    await expect(bolum).toContainText(`${SOAPUI_TABLOSU} · s1 · SUBE: 5 → 7`);
    await expect(bolum.getByRole('table', { name: 'Etkilenen senaryolar' })).toContainText('Şube 5 (ikinci)');
    await expect(bolum).toContainText('2 / 2 seçili');
    // Koru: değer değişmez, etkilenen yok; kaldırınca geri gelir.
    await bolum.getByLabel(/Mevcut değerleri koru/).check();
    await expect(bolum).toContainText('Mevcut değerler korunuyor: tabloda değişen değer yok.');
    await expect(bolum.getByRole('table', { name: 'Etkilenen senaryolar' })).toHaveCount(0);
    await bolum.getByLabel(/Mevcut değerleri koru/).uncheck();
    await expect(bolum).toContainText('SUBE: 5 → 7');
    await bolum.getByRole('checkbox', { name: /^Şube 5 \(ikinci\) · / }).uncheck();
    await expect(bolum).toContainText('1 / 2 seçili');
    await page.waitForTimeout(200);
    await bolum.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('aktarim-onizleme-etkisi.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await bolum.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await bolum.screenshot({ path: test.info().outputPath('aktarim-onizleme-etkisi-telefon.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    expect(await bolum.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
    await page.setViewportSize({ width: 1280, height: 900 });
    // Önizlemede hiçbir şey yazılmadı.
    expect((await senaryolar()).length).toBe(4);
    // Aktar: pencere yok; yalnız işaretli senaryo güncellenir, aktarım aynı işlemde.
    await page.getByRole('button', { name: 'Aktar', exact: true }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[^/]+\/(senaryolar|parametreler)$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const liste = await senaryolar();
    expect(liste.length).toBe(5);
    expect(liste.find((x) => x.baslik === 'Şube 5')?.icerik.govde).toBe(zarf('<Channel>7</Channel>'));
    expect(liste.find((x) => x.baslik === 'Şube 5 (ikinci)')?.icerik.govde).toBe(zarf('<Channel>5</Channel>'));
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('önizlemeden sonra veri değişirse yazılmaz: güncel etki gösterilir, yeniden onay istenir', async () => {
    test.setTimeout(90_000);
    // Önceki testten sonra tablo 7 ve "Yeni teklif" var: yeni adlı senaryoyla, tablo yeniden 5.
    await subeYaz('5');
    const { baglam, page, hatalar, bolum } = await onizlemeyiAc(SOAPUI.replace(/Yeni teklif/g, 'Yeni teklif 2'));
    await page.getByLabel('SUBE nereden dolsun').selectOption('tablo');
    await expect(bolum).toContainText('SUBE: 5 → 7');
    // Arada tablo başka yerden değişti (5 → 6): önizlemedeki etki artık geçerli değil.
    await subeYaz('6');
    const once = (await senaryolar()).length;
    await page.getByRole('button', { name: 'Aktar', exact: true }).click();
    const diyalog = page.getByRole('dialog', { name: 'Önizlemeden sonra değerler değişti' });
    await expect(diyalog).toBeVisible();
    await expect(diyalog).toContainText(`${SOAPUI_TABLOSU} · s1 · SUBE: 6 → 7`);
    // Bölüm de güncel etkiyi gösterir.
    await expect(bolum).toContainText('SUBE: 6 → 7');
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    expect((await senaryolar()).length).toBe(once);
    const t = ((await api(`/platform/tablolar?projeId=${k.projeId}`)).tablolar as Nesne[]).find((x) => x.id === k.soapuiTablo) as Nesne;
    expect(t.satirlar[0].degerler.SUBE).toBe('6');
    // Bölüm artık güncel etkiyi gösteriyor (etkilenen yok): Aktar pencere açmadan yazar.
    await expect(bolum).toContainText('Etkilenen senaryo yok.');
    await page.getByRole('button', { name: 'Aktar', exact: true }).click();
    await expect(page).toHaveURL(/#\/servisler\/s\/[^/]+\/(senaryolar|parametreler)$/);
    const t2 = ((await api(`/platform/tablolar?projeId=${k.projeId}`)).tablolar as Nesne[]).find((x) => x.id === k.soapuiTablo) as Nesne;
    expect(t2.satirlar[0].degerler.SUBE).toBe('7');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
