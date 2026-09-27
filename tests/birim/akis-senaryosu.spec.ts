// KORUMA TESTLERİ — akış senaryosu (servis senaryosu türü "Akış"): akış yalnız operasyon sırası + taşınan değerler (bağlar);
// senaryo her operasyon adımının değerlerini ve beklenen sonucunu tutar. İçerik doğrulaması, form verisi (akıştan gelen kilitli
// alanlar), koşu (sahte SOAP sunucusuna iki istek; ikincisinde ilk yanıttan taşınan değer), toplu koşuya girme, akışın geçtiği
// başka serviste listelenme. Yalnız 127.0.0.1'deki sahte SOAP sunucusu.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  senaryoIceriginiDogrula, servisAkisiKaydet, servisAkisKosulariniListele, servisAkisKosusuGetir, servisGetir, servisSenaryosuKaydet
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, semaYenile, servisiKaydet, servisSenaryolariniKos, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { akisSenaryoFormVerisi, akisSenaryosuDenetle, servisSenaryoGorunumu } from '../../scripts/platform/servisler/akis-senaryosu.mjs';
import { baglariUygula } from '../../scripts/platform/servisler/akis-senaryo-icerigi.mjs';
import { govdeCoz, govdeUret } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { SAHTE_TC, WSDL, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;

test('içerik: yapısal doğrulama; bağlar gövdeye uygulanır (SOAP şemadan, REST JSON)', () => {
  expect(() => senaryoIceriginiDogrula({ tur: 'akis' })).toThrow('akışını seçin');
  expect(() => senaryoIceriginiDogrula({ tur: 'akis', akisId: 'a1', adimlar: { adim1: { operasyon: 'X', kontroller: [] } } })).toThrow('"adim1" adımı: "govde"');
  expect(senaryoIceriginiDogrula({ tur: 'akis', akisId: 'a1', adimlar: { adim1: { operasyon: 'X', govde: '<a/>', kontroller: [] } } }))
    .toEqual({ tur: 'akis', akisId: 'a1', adimlar: { adim1: { operasyon: 'X', govde: '<a/>', kontroller: [] } } });
  const sema = wsdlSemalari(WSDL).Onayla;
  const soap = baglariUygula({ operasyon: 'Onayla', govde: '', kontroller: [] }, { SiparisNo: '${akis:Token}' }, { rest: false, sema, govdeCoz, govdeUret });
  expect(soap.govde).toContain('<SiparisNo>${akis:Token}</SiparisNo>');
  const rest = baglariUygula({ operasyon: 'Yazdir', govde: '{"kayit":{"tur":"K"}}', kontroller: [] }, { 'kayit/no': '${akis:OrderNo}' }, { rest: true });
  expect(JSON.parse(rest.govde)).toEqual({ kayit: { tur: 'K', no: '${akis:OrderNo}' } });
});

test.describe('akış senaryosu koşusu', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('akis-senaryosu');
  let vt: Veritabani;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let projeId = '';
  let testOrtami = '';
  let servisA = '';
  let servisB = '';
  let akisId = '';
  let senaryoId = '';

  test.beforeAll(async () => {
    soap = await sahteSoapSunucusu();
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Akis-Senaryosu-1', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Akış senaryosu projesi' });
    testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, ayarlar: { riskli: false } });
    const servis = async (anahtar: string, ad: string) => {
      const e = await erisimKontrolu(vt, projeId, { ortamId: testOrtami, yol: '/Servis/ornek.asmx' });
      if (!e.erisilebilir) throw new Error('erişim yok');
      const id = servisiKaydet(vt, projeId, { anahtar, ad, yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi });
      await semaYenile(vt, projeId, { servisId: id, ortamId: testOrtami });
      return id;
    };
    servisA = await servis('siparis', 'SiparisServisi');
    servisB = await servis('onay', 'OnayServisi');
    // Servisler arası akış: A.Siparis (yanıttan Token okunur) → B.Onayla (SiparisNo ← ${akis:Token}).
    akisId = servisAkisiKaydet(vt, { projeId, baslik: 'Siparis → Onay', icerik: { adimlar: [
      { id: 'siparis', ad: 'Siparis', tur: 'operasyon', servisId: servisA, operasyon: 'Siparis', okumalar: [{ ad: 'Token', yol: '//Sonuc/Token', gizli: false }] },
      { id: 'onay', ad: 'Onay', tur: 'operasyon', servisId: servisB, operasyon: 'Onayla', baglar: { SiparisNo: '${akis:Token}' } }
    ] } });
  });
  test.afterAll(async () => { vt?.kapat(); await soap?.kapat(); klasor.temizle(); });

  test('form verisi: adım başına servis · operasyon, şema ve akıştan gelen (kilitli) alan', () => {
    expect(servisGetir(vt, servisB)?.ayarlar.operasyonSemalari?.Onayla).toBeTruthy();
    const f = akisSenaryoFormVerisi(vt, projeId, akisId);
    expect(f.adimlar.map((a) => [a.no, a.servis.ad, a.operasyon, a.kilitli])).toEqual([
      [1, 'SiparisServisi', 'Siparis', []],
      [2, 'OnayServisi', 'Onayla', [{ yol: 'SiparisNo', ad: 'Token', ureten: 1 }]]
    ]);
    expect(f.canliEngeli).toEqual([]);
  });

  test('koşu: iki istek sırayla; ikincide ilk yanıttan okunan değer; toplu koşuya girer; akışın geçtiği serviste listelenir', async () => {
    const icerik = { tur: 'akis', akisId, adimlar: {
      siparis: { operasyon: 'Siparis', govde: zarf(`<Giris/><IdentityNumber>${SAHTE_TC}</IdentityNumber>`), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] }
    } };
    expect(akisSenaryosuDenetle(vt, projeId, icerik)).toEqual([]);
    expect(akisSenaryosuDenetle(vt, projeId, { ...icerik, adimlar: { yok: icerik.adimlar.siparis } })[0]).toContain('akışta yok');
    senaryoId = servisSenaryosuKaydet(vt, { projeId, servisId: servisA, baslik: 'Siparis ve onay', kapsam: 'test', icerik });
    const once = soap.istekler.length;
    const r = await servisSenaryosuCalistir(vt, projeId, { servisId: servisA, ortamId: testOrtami, tur: 'kosu', senaryoId }) as Record<string, any>;
    expect(r.durum).toBe('basarili');
    expect(r.kontroller.map((k: Record<string, unknown>) => k.gecti)).toEqual([true, true]);
    const [ilk, ikinci] = soap.istekler.slice(once);
    expect(ilk.govde).toContain('<Giris/>');
    // Token gizli değil (gizli: false): akış kaydında okunan değer görünür; ikinci isteğin gövdesinde aynı değer.
    const adimlar = (servisAkisKosusuGetir(vt, r.akisKosuId)?.sonuc as Record<string, any>).adimlar;
    const token = adimlar[0].okunanlar.Token;
    expect(token).toMatch(/^tok-\d+$/);
    expect(ikinci.govde).toContain(`<SiparisNo>${token}</SiparisNo>`);
    // Akış koşusu senaryonun başlığıyla kaydedilir.
    expect(servisAkisKosulariniListele(vt, { projeId, akisId }).map((k) => k.baslik)).toContain('Siparis ve onay');
    // B servisinin listesinde (başka serviste kayıtlı) görünür, son sonucu akış koşusundan.
    const g = servisSenaryoGorunumu(vt, projeId, servisB, [], {});
    expect(g.senaryolar.map((s) => [s.baslik, s.gecen, s.akisAdi, s.sahipServisAd])).toEqual([['Siparis ve onay', true, 'Siparis → Onay', 'SiparisServisi']]);
    expect(g.sonSonuclar[senaryoId]).toMatchObject({ durum: 'basarili', akisId });
    // B'nin toplu koşusu akış senaryosunu da koşar.
    const t = await servisSenaryolariniKos(vt, projeId, { servisId: servisB, ortamId: testOrtami });
    expect(t.sonuclar.map((x) => [x.baslik, x.durum])).toEqual([['Siparis ve onay', 'basarili']]);
  });

  test('bağlanan değer önce okunmuyorsa senaryo reddedilir (istek atılmaz)', async () => {
    const bozuk = servisAkisiKaydet(vt, { projeId, baslik: 'Bozuk', icerik: { adimlar: [
      { id: 'onay', ad: 'Onay', tur: 'operasyon', servisId: servisB, operasyon: 'Onayla', baglar: { SiparisNo: '${akis:Token}' } }
    ] } });
    const id = servisSenaryosuKaydet(vt, { projeId, servisId: servisB, baslik: 'Bozuk senaryo', kapsam: 'test', icerik: { tur: 'akis', akisId: bozuk, adimlar: {} } });
    const once = soap.istekler.length;
    await expect(servisSenaryosuCalistir(vt, projeId, { servisId: servisB, ortamId: testOrtami, tur: 'kosu', senaryoId: id })).rejects.toThrow('${akis:Token} önceki adımlarda okunmuyor');
    expect(soap.istekler.length).toBe(once);
  });
});
