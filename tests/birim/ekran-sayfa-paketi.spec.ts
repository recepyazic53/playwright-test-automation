// KORUMA TESTLERİ — Ekranlar: ekran paketi (biçim + gizli değer reddi), model fark motoru (tüm bulgu
// türleri), kabul edilen alt kümenin uygulanması (yeni sürüm), etki hesabı ve ekran servisi (Ekran ekle →
// tekrar analiz → kabul/red → reddedilenlerin hatırlanması → toplu değer atama → Claude dosyası).
// Paketler SAHTE değerlidir (tests/birim/fixtures/sayfa-paketi/). Tarayıcı açmaz, siteye bağlanmaz; servis
// testleri kendi geçici klasöründe (geçici veritabanı + şifreli medya) çalışır.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  baglamProfiliKaydet, ekranModeliGetir, ortamKaydet, projeKaydet, senaryoGetir, testVerisiTuruKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { gizliAdMi, gizliKalipBul, sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { bulgulariUygula, etkiHesapla, modelFarki, type Bulgu } from '../../scripts/platform/ekranlar/model-farki.mjs';
import {
  EkranDogrulamaHatasi, analizGetir, analizUygula, analizYukle, claudeDosyasiYaz, ekranDetayi, ekranListesi, paketOnizle, sayfaEkle,
  surumAyrintisi, topluDegerAta
} from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { ekranModeliniKur } from '../support/ekran-modeli';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Nesne = Record<string, unknown>;
const FIKSTUR = resolve(__dirname, 'fixtures', 'sayfa-paketi');
const oku = (ad: string): Nesne => JSON.parse(readFileSync(join(FIKSTUR, ad), 'utf-8')) as Nesne;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const V1 = oku('ornek-rota-v1.json');
const V2 = oku('ornek-rota-v2.json');
const M1 = V1.model as Nesne;
const M2 = V2.model as Nesne;
const dogrula = (model: unknown) => ekranModeliniDogrula('model', model, () => { throw new Error('alt model yok'); });

/** Modeldeki alanı (iç içe dahil) bulur. */
function alanBul(model: Nesne, id: string): Nesne {
  let bulunan: Nesne | undefined;
  const gez = (liste: unknown) => {
    for (const a of (Array.isArray(liste) ? liste : []) as Nesne[]) {
      if (a.id === id) bulunan = a;
      gez(a.altAlanlar); gez(a.ekranAlanlari);
    }
  };
  for (const adim of model.adimlar as Nesne[]) for (const b of (adim.bolumler ?? []) as Nesne[]) gez(b.alanlar);
  if (!bulunan) throw new Error(`alan yok: ${id}`);
  return bulunan;
}
const adim = (model: Nesne, id: string) => (model.adimlar as Nesne[]).find((a) => a.id === id) as Nesne;
const bolum = (model: Nesne, adimId: string, bolumId: string) => ((adim(model, adimId).bolumler as Nesne[]).find((b) => b.id === bolumId)) as Nesne;
const turler = (b: Bulgu[]) => b.map((x) => (x.altTur ? `${x.tur}:${x.altTur}` : x.tur)).sort();

// ---------------------------------------------------------------------------------------
// Paket biçimi
// ---------------------------------------------------------------------------------------

test.describe('Ekran paketi — doğrulama', () => {
  test('örnek v1 ve v2 paketleri geçerli; modele uymayan öneri uyarı olur ve işaretlenir', () => {
    const d1 = sayfaPaketiniDogrula(V1);
    expect(d1.hatalar).toEqual([]);
    expect(d1.gecerli).toBe(true);
    expect(d1.senaryoSorunlari.map((s) => s.length)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(d1.uyarilar.some((u) => u.yer === 'senaryoOnerileri[5]' && u.mesaj.includes('KURYE'))).toBe(true);
    expect(sayfaPaketiniDogrula(V2).gecerli).toBe(true);
    // Paket modeli testlerin model yükleyicisinden de geçer (ortak doğrulayıcı; baglamGorunurlugu dahil).
    expect(() => ekranModeliniKur('ornek-rota.model.json', { 'ornek-rota.model.json': M2 })).not.toThrow();
  });

  test('biçim hataları açık mesajla listelenir', () => {
    const tur = sayfaPaketiniDogrula({ ...V1, tur: 'baska' });
    expect(tur.hatalar[0]).toMatchObject({ yer: 'tur' });
    const p = kopya(V1);
    (p.meta as Nesne).ekran = { anahtar: 'Büyük Harf', ad: '', urlYolu: 'rota' };
    (p as Nesne).fazla = 1;
    delete (p as Nesne).bilinmeyenler;
    (p.senaryoOnerileri as Nesne[])[1].baslik = (p.senaryoOnerileri as Nesne[])[0].baslik;
    const d = sayfaPaketiniDogrula(p);
    expect(d.gecerli).toBe(false);
    expect(d.hatalar.map((h) => h.yer)).toEqual(['fazla']); // bilinmeyen üst anahtar: diğer kontrollere geçilmez
    delete (p as Nesne).fazla;
    const yerler = sayfaPaketiniDogrula(p).hatalar.map((h) => h.yer);
    expect(yerler).toEqual(expect.arrayContaining(['meta.ekran.anahtar', 'meta.ekran.ad', 'meta.ekran.urlYolu', 'model.id', 'bilinmeyenler', 'senaryoOnerileri[1].baslik']));
    // Bozuk model: ortak doğrulayıcının maddeleri "model" yerinde döner.
    const p3 = kopya(V1);
    (p3.model as Nesne).adimlar = [];
    const d3 = sayfaPaketiniDogrula(p3);
    expect(d3.hatalar.some((h) => h.yer === 'model' && h.mesaj.includes('"adimlar" boş olmayan dizi olmalı'))).toBe(true);
  });

  test('gizli/kişisel değer içeren paket reddedilir (kart, T.C., IBAN, JWT, parola alanı, özel anahtar, adres, hassas varsayılan)', () => {
    const p = kopya(V1);
    const o = p.senaryoOnerileri as Nesne[];
    (o[0].veri as Nesne).odeyenOzelKimligi = { tcKimlikNo: '10000000146' };
    (o[1].veri as Nesne).krediKarti = { kartNo: '4111 1111 1111 1111' };
    (o[2].veri as Nesne).not = 'IBAN TR33 0006 1005 1978 6457 8413 26';
    (p.gerekenAyarlar as Nesne).not = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456';
    (p.meta as Nesne).not = 'https://kullanici:gizli@ornek.invalid/giris';
    (p.bilinmeyenler as string[]).push('-----BEGIN RSA PRIVATE KEY-----');
    (p.bilinmeyenler as string[]).push('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N');
    (o[3].veri as Nesne).parola = 'Gizli-123';
    (o[4].veri as Nesne).apiKey = 'x';
    const alan = alanBul(p.model as Nesne, 'taksitSayisi');
    alan.hassas = true;
    alan.varsayilan = { deger: '6' };
    (p.model as Nesne).ekranUrl = 'https://ornek.invalid/rota/';
    const d = sayfaPaketiniDogrula(p);
    expect(d.gecerli).toBe(false);
    const metin = d.hatalar.map((h) => `${h.yer}: ${h.mesaj}`).join('\n');
    for (const beklenen of [
      'senaryoOnerileri[0].veri.odeyenOzelKimligi.tcKimlikNo: T.C. kimlik numarası', 'senaryoOnerileri[1].veri.krediKarti.kartNo: kart numarası',
      'senaryoOnerileri[2].veri.not: IBAN', 'gerekenAyarlar.not: yetkilendirme başlığı', 'meta.not: adreste kullanıcı adı:parola',
      'özel anahtar', 'erişim anahtarı (JWT)', 'senaryoOnerileri[3].veri.parola: "parola" adlı alanda değer',
      'senaryoOnerileri[4].veri.apiKey: "apiKey" adlı alanda değer', 'taksitSayisi).varsayilan.deger: gizli/hassas alanın varsayılan değeri dolu',
      'model.ekranUrl: tam adres değil YOL'
    ]) expect(metin).toContain(beklenen);
    expect(metin).toContain('Ekran paketleri gizli ya da kişisel veri içeremez');
  });

  test('gizli değer taraması yanlış alarm vermez (seçici, tarih, kısa kodlar, geçersiz numaralar)', () => {
    for (const temiz of ['#txtPassword', '2026-09-25T10:30:00Z', '90002', '0555 555 55 55', '12345678901', '4111 1111 1111 1112', 'sof_kartNo']) {
      expect(gizliKalipBul(temiz), temiz).toBeNull();
    }
    expect(gizliAdMi('guvenlikKodu')).toBe(true);
    expect(gizliAdMi('totpGizli')).toBe(true);
    expect(gizliAdMi('pinned')).toBe(false);
    expect(gizliAdMi('kapsam')).toBe(false);
  });

  test('JSON Schema dosyası doğrulayıcıyla aynı üst düzey ve zorunlu anahtarları tanımlar', () => {
    const sema = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'docs', 'sayfa-paketi.schema.json'), 'utf-8')) as Nesne;
    expect(Object.keys(sema.properties as Nesne).sort()).toEqual(['$schema', 'bilinmeyenler', 'gerekenAyarlar', 'kanitlar', 'meta', 'model', 'senaryoOnerileri', 'surum', 'testVerisi', 'tur']);
    expect(sema.required).toEqual(['tur', 'surum', 'meta', 'model', 'senaryoOnerileri', 'gerekenAyarlar', 'bilinmeyenler']);
    for (const zorunlu of sema.required as string[]) {
      const p = kopya(V1);
      delete p[zorunlu];
      expect(sayfaPaketiniDogrula(p).gecerli, zorunlu).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------
// Fark motoru
// ---------------------------------------------------------------------------------------

test.describe('Model fark motoru', () => {
  test('örnek v1 → v2: yedi bulgu (her tür için beklenen eski/yeni)', () => {
    const b = modelFarki(M1, M2);
    expect(turler(b)).toEqual([
      'adimDegisikligi:baslik', 'etiketDegisikligi', 'gorunurlukDegisikligi', 'kaldirilanAlan', 'kaldirilanSecenek', 'yeniAlan', 'yeniSecenek'
    ]);
    const bul = (t: string) => b.find((x) => x.tur === t) as Bulgu;
    expect(bul('yeniAlan')).toMatchObject({ alanId: 'rotaAmaci', yeni: { zorunlu: true, secenekSayisi: 3, senaryoAnahtari: 'rotaAmaci' } });
    expect(bul('yeniSecenek')).toMatchObject({ alanId: 'kapsam', secenek: { deger: 'KURYE' } });
    expect(bul('kaldirilanSecenek')).toMatchObject({ alanId: 'odeyen', secenek: { deger: 'farkliTuzel' } });
    expect(bul('etiketDegisikligi')).toMatchObject({ alanId: 'sorguTipi', eski: 'Sorgu Tipi', yeni: 'Sorgulama türü' });
    expect(bul('kaldirilanAlan')).toMatchObject({ alanId: 'hediyePaketi' });
    expect(bul('gorunurlukDegisikligi')).toMatchObject({ alanId: 'ekHizmet', profil: 'varsayilan', eski: false, yeni: true });
    // Kimlikler kararlı: aynı fark yeniden hesaplanınca aynı kimlik/imza.
    expect(modelFarki(M1, M2).map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(modelFarki(M1, M1)).toEqual([]);
  });

  test('tip, zorunluluk, görünürlük koşulu, adım/bölüm ekleme-kaldırma, taşıma ve sıra değişiklikleri', () => {
    const taban = kopya(M1);
    (adim(taban, 'ekranAcilir').bolumler as Nesne[]).push({ id: 'eskiBolum', baslik: 'Eski', alanlar: [{ id: 'eskiAlan', tip: 'metin', altAlanlar: [{ id: 'eskiAltAlan', tip: 'metin' }] }] });
    const y = kopya(taban);
    alanBul(y, 'cokluSorguKisiSayisi').tip = 'metin';
    alanBul(y, 'hediyePaketi').zorunlu = true;
    delete alanBul(y, 'plan').gorunurluk;
    // Alan taşıma: ülke → sorgu bölümüne
    const teslimatlar = bolum(y, 'basvuruBilgileri', 'teslimatlar');
    const ulke = (teslimatlar.alanlar as Nesne[]).find((a) => a.id === 'ulke') as Nesne;
    teslimatlar.alanlar = (teslimatlar.alanlar as Nesne[]).filter((a) => a !== ulke);
    (bolum(y, 'basvuruBilgileri', 'sorgu').alanlar as Nesne[]).push(ulke);
    // Yeni bölüm (var olan adımda) ve yeni adım; kaldırılan bölüm
    (adim(y, 'toplamHesaplama').bolumler as Nesne[]).push({ id: 'indirim', baslik: 'İndirim', alanlar: [{ id: 'indirimKodu', tip: 'metin', yapilandirma: 'senaryo', eslesme: { senaryo: 'indirimKodu' } }] });
    const adimlar = y.adimlar as Nesne[];
    adimlar.splice(4, 0, { id: 'onay', sira: 0, baslik: 'Onay', bolumler: [{ id: 'onayBolumu', baslik: 'Onay', alanlar: [{ id: 'onayKutusuAlani', tip: 'onayKutusu' }] }] });
    adim(y, 'ekranAcilir').bolumler = (adim(y, 'ekranAcilir').bolumler as Nesne[]).filter((b) => b.id !== 'eskiBolum');
    // Sıra: ilk iki adım yer değiştirir
    [adimlar[0], adimlar[1]] = [adimlar[1], adimlar[0]];
    adimlar.forEach((a, i) => { a.sira = i + 1; });
    const b = modelFarki(taban, y);
    expect(turler(b)).toEqual([
      'adimDegisikligi:alanTasindi', 'adimDegisikligi:kaldirilanBolum', 'adimDegisikligi:sira', 'adimDegisikligi:yeniAdim', 'adimDegisikligi:yeniBolum',
      'gorunurlukDegisikligi', 'tipDegisikligi', 'zorunlulukDegisikligi'
    ]);
    expect(b.find((x) => x.tur === 'tipDegisikligi')).toMatchObject({ alanId: 'cokluSorguKisiSayisi', eski: 'sayi', yeni: 'metin' });
    expect(b.find((x) => x.tur === 'zorunlulukDegisikligi')).toMatchObject({ eski: false, yeni: true });
    expect(b.find((x) => x.tur === 'gorunurlukDegisikligi')).toMatchObject({ alanId: 'plan', profil: null, yeni: 'her zaman' });
    // İç içe alanlar ayrı bulgu değildir (kaldırılan bölümün alanı ve alt alanı).
    expect(b.filter((x) => x.tur === 'kaldirilanAlan')).toEqual([]);
    // Hepsi uygulanınca yeni modelle fark kalmaz ve model geçerlidir.
    const u = bulgulariUygula(taban, y, b.map((x) => x.id));
    expect(u.atlananlar).toEqual([]);
    expect(modelFarki(u.model, y)).toEqual([]);
    expect(() => dogrula(u.model)).not.toThrow();
  });

  test('yalnızca kabul edilen alt küme uygulanır; kalan fark = reddedilenler; sonuç geçerli ve özgün model değişmez', () => {
    const b = modelFarki(M1, M2);
    const once = JSON.stringify(M1);
    const kabul = b.filter((x) => ['yeniAlan', 'yeniSecenek', 'etiketDegisikligi', 'kaldirilanAlan', 'gorunurlukDegisikligi'].includes(x.tur));
    const u = bulgulariUygula(M1, M2, kabul.map((x) => x.id));
    expect(JSON.stringify(M1)).toBe(once);
    expect(u.uygulananlar.sort()).toEqual(kabul.map((x) => x.id).sort());
    expect(() => dogrula(u.model)).not.toThrow();
    // Uygulanan sürüm ile paket arasında yalnızca reddedilen iki değişiklik kalır (aynı imzayla).
    const kalan = modelFarki(u.model, M2);
    expect(kalan.map((x) => x.imza).sort()).toEqual(b.filter((x) => !kabul.includes(x)).map((x) => x.imza).sort());
    // Yeni alan doğru yere (ülkeden sonra) ve bağlam görünürlüğüyle; kaldırılanın görünürlük kaydı silinir.
    const ids = (bolum(u.model, 'basvuruBilgileri', 'teslimatlar').alanlar as Nesne[]).map((a) => a.id);
    expect(ids.indexOf('rotaAmaci')).toBe(ids.indexOf('ulke') + 1);
    expect(ids).not.toContain('hediyePaketi');
    const bg = u.model.baglamGorunurlugu as { alanlar: Record<string, Nesne> };
    expect(bg.alanlar.rotaAmaci).toEqual({ varsayilan: true, ÖzelTanımlıŞube: true });
    expect(bg.alanlar.hediyePaketi).toBeUndefined();
    expect(bg.alanlar.ekHizmet.varsayilan).toBe(true);
    // Reddedilen seçenek ve adım başlığı eski halinde.
    expect((alanBul(u.model, 'odeyen').secenekler as Nesne[]).map((s) => s.deger)).toContain('farkliTuzel');
    expect(adim(u.model, 'toplamHesaplama').baslik).toBe('Toplam hesaplanır');
    // Boş kabul listesi → model aynı.
    expect(modelFarki(bulgulariUygula(M1, M2, []).model, M1)).toEqual([]);
  });

  test('bağımlı değişiklik: yeni adımdaki koşulun adlandırılmış koşulu ve senaryo ayarı birlikte gelir', () => {
    const y = kopya(M1);
    (y.kosullar as Nesne).yeniAyarAcik = { ifade: { senaryoAyari: 'ekAdimDahil', esit: true } };
    (y.senaryoDuzeyi as { alanlar: Nesne[] }).alanlar.push({ id: 'ekAdimDahil', tip: 'onayKutusu', yapilandirma: 'senaryo', eslesme: { senaryo: 'ekAdimDahil' } });
    (y.adimlar as Nesne[]).push({ id: 'ekAdim', sira: 6, baslik: 'Ek adım', gorunurluk: { kosul: 'yeniAyarAcik' }, bolumler: [{ id: 'ekBolum', baslik: 'Ek', alanlar: [{ id: 'ekAlan', tip: 'metin' }] }] });
    const b = modelFarki(M1, y);
    expect(turler(b)).toEqual(['adimDegisikligi:yeniAdim']);
    const u = bulgulariUygula(M1, y, [b[0].id]);
    expect((u.model.kosullar as Nesne).yeniAyarAcik).toBeDefined();
    expect((u.model.senaryoDuzeyi as { alanlar: Nesne[] }).alanlar.some((a) => a.id === 'ekAdimDahil')).toBe(true);
    expect(() => dogrula(u.model)).not.toThrow();
  });

  test('etki: eksik zorunlu değer, kaldırılan seçenek/alan kullanımı, tip kontrolü, görünmez profil', () => {
    const senaryolar = [
      { id: 's1', baslik: 'A', veri: { kapsam: 'EKSPRES', odeyen: 'farkliTuzel', hediyePaketi: true }, mutlakaGorunmeli: [], baglamProfili: 'varsayilan' },
      { id: 's2', baslik: 'B', veri: { kapsam: 'STANDART', odeyen: 'ayni', rotaAmaci: 'IS', cokluSorguKisiSayisi: 3 }, mutlakaGorunmeli: ['hediyePaketi'], baglamProfili: 'Yetkili' },
      { id: 's3', baslik: 'C', veri: { kapsam: 'STANDART', odeyen: 'ayni', ekHizmet: 'E' }, mutlakaGorunmeli: ['ekHizmet'], baglamProfili: 'Yetkili' }
    ];
    const b = modelFarki(M1, M2);
    const e = etkiHesapla(b, M1, M2, senaryolar);
    const etki = (tur: string) => e.find((x) => x.bulguId === (b.find((y) => y.tur === tur) as Bulgu).id);
    expect(etki('yeniAlan')).toMatchObject({ tur: 'eksikDeger', anahtar: 'rotaAmaci', atanabilir: true, senaryolar: [{ id: 's1' }, { id: 's3' }] });
    expect(etki('yeniAlan')?.secenekler?.map((s) => s.deger)).toEqual(['TURISTIK', 'IS', 'EGITIM']);
    expect(etki('kaldirilanSecenek')).toMatchObject({ tur: 'kullanilanSecenek', senaryolar: [{ id: 's1', deger: 'farkliTuzel' }] });
    expect(etki('kaldirilanAlan')).toMatchObject({ tur: 'kaldirilanAlanKullanimi', senaryolar: [{ id: 's1', mutlakaGorunmeli: false }, { id: 's2', mutlakaGorunmeli: true }] });
    expect(etki('etiketDegisikligi')).toMatchObject({ tur: 'yok', senaryolar: [] });
    // Tip değişikliği + profilde görünmez olan alan
    const y = kopya(M2);
    alanBul(y, 'cokluSorguKisiSayisi').tip = 'metin';
    ((y.baglamGorunurlugu as Nesne).profiller as string[]).push('Yetkili');
    ((y.baglamGorunurlugu as { alanlar: Record<string, Nesne> }).alanlar.ekHizmet).Yetkili = false;
    const b2 = modelFarki(M2, y);
    const e2 = etkiHesapla(b2, M2, y, senaryolar);
    expect(e2.find((x) => x.bulguId === b2.find((z) => z.tur === 'tipDegisikligi')?.id)).toMatchObject({ tur: 'tipKontrolu', senaryolar: [{ id: 's2' }] });
    expect(e2.find((x) => x.bulguId === b2.find((z) => z.tur === 'gorunurlukDegisikligi')?.id)).toMatchObject({ tur: 'gorunmezProfil', senaryolar: [{ id: 's3', mutlakaGorunmeli: true }] });
  });
});

// ---------------------------------------------------------------------------------------
// Ekran servisi (geçici veritabanı)
// ---------------------------------------------------------------------------------------

test.describe('Ekran servisi — Ekran ekle, tekrar analiz, kararlar, etki', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  let ortamId: string;

  test.beforeEach(async () => {
    klasor = geciciKlasor('ekranlar');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Ekranlar-Kasa-Parolasi-9', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    baglamProfiliKaydet(vt, { projeId, tur: 'Rol', ad: 'varsayilan', alanlar: { kod: '1' } });
    baglamProfiliKaydet(vt, { projeId, tur: 'Rol', ad: 'ÖzelTanımlıŞube', alanlar: { kod: '2' } });
    testVerisiTuruKaydet(vt, { projeId, ad: 'Bireysel kişi', alanlar: [{ ad: 'tcKimlikNo', hassas: true }] });
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });

  test('uçtan uca: ekle → yükle → kabul/red → v2 yalnızca kabul edilenler → reddedilenler gizli → toplu atama → Claude dosyası', async () => {
    const medya = join(klasor.yol, 'medya');
    // Önizleme: 5 öneri seçili gelir, KURYE önerisi seçilemez; gereken ayarlar projeyle karşılaştırılır.
    const o = paketOnizle(vt, projeId, V1);
    expect(o.gecerli).toBe(true);
    expect(o.onizleme?.senaryolar.filter((s) => s.varsayilanSecili).length).toBe(5);
    expect(Object.fromEntries((o.onizleme?.gerekenAyarlar ?? []).map((g) => [g.anahtar, g.durum]))).toMatchObject({
      giris: 'eksik', ikiAsamali: 'eksik', 'tur:Bireysel kişi': 'tamam', 'tur:Tüzel kişi': 'eksik', 'baglam:Şube': 'eksik'
    });
    // Sorunlu öneri seçilemez.
    await expect(sayfaEkle(vt, projeId, V1, { senaryoIndeksleri: [5], ortamIdleri: [ortamId], medyaKlasoru: medya })).rejects.toThrow('modele uymuyor');
    const ek = await sayfaEkle(vt, projeId, V1, { senaryoIndeksleri: [0, 1, 2, 3, 4], ortamIdleri: [ortamId], medyaKlasoru: medya });
    expect(ek).toMatchObject({ surum: 1, kanitSayisi: 2 });
    expect(ek.senaryoIdleri).toHaveLength(5);
    for (const id of ek.senaryoIdleri) {
      const s = senaryoGetir(vt, id);
      expect(s?.kosuyaDahil).toBe(false);
      expect(s?.icerik).toMatchObject({ kaynak: { dosya: 'scenarios/ornek-rota/siparis.spec.ts' }, veri: { dosya: 'ornek-rota', yol: 'senaryolar' }, paket: { kaynak: 'sayfa-paketi' } });
    }
    // Aynı anahtarla ikinci kez "Ekran ekle" reddedilir.
    expect(paketOnizle(vt, projeId, V1).hatalar[0].mesaj).toContain('zaten var');
    // Kanıtlar şifreli: medya dosyalarında PNG imzası yok.
    const dosyalar = readdirSync(medya).filter((d) => d.endsWith('.medya'));
    expect(dosyalar).toHaveLength(2);
    for (const d of dosyalar) expect(readFileSync(join(medya, d)).includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(ekranListesi(vt, projeId).ekranlar[0]).toMatchObject({ anahtar: 'ornek-rota', modelSurumu: 1, senaryoSayisi: 5 });

    // Tekrar analiz
    const y = await analizYukle(vt, projeId, ek.ekranId, V2, { medyaKlasoru: medya });
    expect(y).toMatchObject({ bulguSayisi: 7, gizlenenSayisi: 0 });
    let a = analizGetir(vt, projeId, ek.ekranId).analiz;
    if (!a) throw new Error('analiz yok');
    const bulgu = (tur: string) => a?.bulgular.find((b) => b.tur === tur) as Bulgu;
    expect(a.etki.find((e) => e.bulguId === bulgu('yeniAlan').id)).toMatchObject({ tur: 'eksikDeger', senaryolar: expect.arrayContaining([]) });
    expect(a.etki.find((e) => e.bulguId === bulgu('yeniAlan').id)?.senaryolar).toHaveLength(5);
    expect(a.etki.find((e) => e.bulguId === bulgu('kaldirilanSecenek').id)?.senaryolar).toHaveLength(1);
    expect(a.etki.find((e) => e.bulguId === bulgu('kaldirilanAlan').id)?.senaryolar).toHaveLength(1);
    // Toplu atama, alan modele girmeden reddedilir.
    expect(() => topluDegerAta(vt, projeId, ek.ekranId, { anahtar: 'rotaAmaci', deger: 'IS', senaryoIdler: ek.senaryoIdleri })).toThrow('güncel modelde');
    const red = [bulgu('kaldirilanSecenek').id, bulgu('adimDegisikligi').id];
    const kabul = a.bulgular.map((b) => b.id).filter((id) => !red.includes(id));
    expect(analizUygula(vt, projeId, ek.ekranId, { analizId: a.id, kabul, red })).toEqual({ surum: 2, yeniSurum: true, kabul: 5, red: 2, kararsiz: 0, baglanan: 0 });
    const v2 = ekranModeliGetir(vt, ek.ekranId)?.model as Nesne;
    expect(modelFarki(v2, M2).map((b) => b.imza).sort()).toEqual([bulgu('kaldirilanSecenek').imza, bulgu('adimDegisikligi').imza].sort());
    expect(surumAyrintisi(vt, projeId, ek.ekranId, 2).bulgular).toHaveLength(5);
    expect(ekranDetayi(vt, projeId, ek.ekranId).gecmis.map((g) => g.surum)).toEqual([2, 1]);
    // Aynı analiz ikinci kez uygulanamaz.
    expect(() => analizUygula(vt, projeId, ek.ekranId, { analizId: a?.id, kabul, red })).toThrow('Bekleyen analiz bulunamadı');

    // Aynı paket yeniden: reddedilen iki değişiklik gizlenir, yeni bulgu yok.
    expect(await analizYukle(vt, projeId, ek.ekranId, V2, { medyaKlasoru: medya })).toMatchObject({ analizId: null, bulguSayisi: 0, gizlenenSayisi: 2 });
    // Reddedilen değişiklik FARKLI gelirse (başka seçenek kaldırıldı) yeniden bulgu olur.
    const v3 = kopya(V2);
    (alanBul(v3.model as Nesne, 'odeyen').secenekler as Nesne[]).splice(1, 1);
    const y3 = await analizYukle(vt, projeId, ek.ekranId, v3, { medyaKlasoru: medya });
    expect(y3).toMatchObject({ bulguSayisi: 1, gizlenenSayisi: 2 });

    // Uygulanmış analizin etki paneli: toplu değer atama → eksik kalmaz.
    a = analizGetir(vt, projeId, ek.ekranId).analiz;
    expect(a?.durum).toBe('bekliyor');
    expect(() => topluDegerAta(vt, projeId, ek.ekranId, { anahtar: 'rotaAmaci', deger: 'YOK', senaryoIdler: ek.senaryoIdleri })).toThrow('seçeneklerden biri');
    expect(topluDegerAta(vt, projeId, ek.ekranId, { anahtar: 'rotaAmaci', deger: 'IS', senaryoIdler: ek.senaryoIdleri })).toEqual({ guncellenen: 5 });
    expect(topluDegerAta(vt, projeId, ek.ekranId, { anahtar: 'rotaAmaci', deger: 'IS', senaryoIdler: ek.senaryoIdleri })).toEqual({ guncellenen: 0 });
    const s0 = senaryoGetir(vt, ek.senaryoIdleri[0]);
    const ortamVeri = ((s0?.icerik.ortamlar as Record<string, Nesne>)[ortamId].veri) as Nesne;
    expect(ortamVeri.rotaAmaci).toBe('IS');

    // Claude dosyası: tekrar analiz isteği profil ADLARIYLA; gizli değer yok; son seçim saklanır.
    expect(() => claudeDosyasiYaz(vt, projeId, ek.ekranId, { tur: 'tekrar-analiz', baglamProfilleri: [], klasor: join(klasor.yol, 'analiz'), projeKoku: klasor.yol })).toThrow('En az bir');
    const c = claudeDosyasiYaz(vt, projeId, ek.ekranId, { tur: 'tekrar-analiz', baglamProfilleri: ['varsayilan', 'bilinmeyen-profil'], klasor: join(klasor.yol, 'analiz'), projeKoku: klasor.yol });
    expect(c.yol).toMatch(/^analiz\/ornek-rota-\d{8}-\d{6}-tekrar-analiz\.json$/);
    expect(c.cumle).toContain('varsayilan');
    const icerik = readFileSync(c.tamYol, 'utf-8');
    const j = JSON.parse(icerik) as Nesne;
    expect((j.istek as Nesne).baglamProfilleri).toEqual(['varsayilan']);
    expect(icerik).not.toContain('kasa:v1:');
    expect(icerik).not.toContain('vkn1');
    expect(icerik).not.toContain('"kod"');
    expect(ekranDetayi(vt, projeId, ek.ekranId).analiz.sonBaglamProfilleri).toEqual(['varsayilan']);
  });

  test('geçersiz kabul kümesi (uygulanan model doğrulayıcıdan geçmez) hiçbir şey yazmaz', async () => {
    const medya = join(klasor.yol, 'medya');
    const ek = await sayfaEkle(vt, projeId, V1, { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: medya });
    // Paket sorguTipi alanını ve ona başvuran koşulları birlikte kaldırıyor (paket geçerli). Yalnızca
    // "kaldırılan alan" kabul edilirse eski koşullar olmayan alana başvurur → model geçersiz → yazılmaz.
    const p = kopya(V2);
    const m = p.model as Nesne;
    const sorgu = bolum(m, 'basvuruBilgileri', 'sorgu');
    sorgu.alanlar = (sorgu.alanlar as Nesne[]).filter((a) => a.id !== 'sorguTipi');
    delete (m.kosullar as Nesne).tekliSorgu;
    delete (m.kosullar as Nesne).cokluSorgu;
    const temizle = (d: unknown): void => {
      if (Array.isArray(d)) { d.forEach(temizle); return; }
      if (!d || typeof d !== 'object') return;
      const n = d as Nesne;
      if (n.gorunurluk && typeof n.gorunurluk === 'object' && ['tekliSorgu', 'cokluSorgu'].includes(String((n.gorunurluk as Nesne).kosul))) delete n.gorunurluk;
      Object.values(n).forEach(temizle);
    };
    temizle(m.adimlar);
    delete ((m.baglamGorunurlugu as Nesne).alanlar as Nesne).sorguTipi;
    expect(sayfaPaketiniDogrula(p).hatalar).toEqual([]);
    const y = await analizYukle(vt, projeId, ek.ekranId, p, { medyaKlasoru: medya });
    const a = analizGetir(vt, projeId, ek.ekranId).analiz;
    expect(y.analizId).toBe(a?.id);
    const kaldir = a?.bulgular.find((b) => b.tur === 'kaldirilanAlan' && b.alanId === 'sorguTipi');
    let hata: unknown;
    try { analizUygula(vt, projeId, ek.ekranId, { analizId: a?.id, kabul: [kaldir?.id], red: [] }); } catch (e) { hata = e; }
    expect(hata).toBeInstanceOf(EkranDogrulamaHatasi);
    expect((hata as EkranDogrulamaHatasi).hatalar.some((h) => h.mesaj.includes('başvurulan alan "sorguTipi" modelde yok'))).toBe(true);
    expect(analizGetir(vt, projeId, ek.ekranId).analiz?.durum).toBe('bekliyor');
    expect(ekranModeliGetir(vt, ek.ekranId)?.surum).toBe(1);
  });
});
