// KORUMA TESTLERİ — TEST VERİSİ TABLOSUNDA DEĞER DEĞİŞİNCE SENARYOLAR (tablolar/tablo-etkisi.mjs, servisler/govde-degeri.mjs):
//  · saf: hücre değişiklikleri (satır kimliği, sütun yeniden adlandırma, silinen satır / boşaltılan hücre), bağımlı listede satır
//    uyuşması, "eski değer hâlâ tabloda" kuralı, satır seçimi, karşılık taşıma, gövdede yalnız ilgili öğenin değişmesi (SOAP / REST).
//  · geçici veritabanı (süreç içi; ağ yok): etki analizi (ekran alanı, servis alanı, satır seçimi, bağımlı liste, silinen değer,
//    gizli sütun maskesi, koşan senaryo), onaysız hiçbir şey yazılmaz, onayla yalnız seçilenler + değişiklik geçmişi, "yalnız tablo"
//    senaryolara dokunmaz, tek işlem (hata → hiçbiri), etki yoksa doğrudan kaydedilir.
//  · arayüz (ayrı Nöbetçi 127.0.0.1, geçici veritabanı): Kaydet → onay penceresi (masaüstü + 390px ekran görüntüsü, taşma yok),
//    yalnız işaretliler güncellenir; etki yoksa pencere çıkmaz. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { senaryoDetayi, senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { tabloKaydet, tablolariListele, type Tablo } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglariniKaydet } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import {
  MASKE, degerEtkisi, eskiSatirlar, hucreDegisiklikleri, karsiliklariTasi, secimEtkisi, sutunTasimasi, tabloKaydetEtkiyle, type Etkilenen
} from '../../scripts/platform/tablolar/tablo-etkisi.mjs';
import { NEDENLER as GOVDE_NEDENLERI, restDegeriniDegistir, soapDegeriniDegistir } from '../../scripts/platform/servisler/govde-degeri.mjs';
import { servisKaydet, servisSenaryosuGetir, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { wsdlSemalari } from '../../scripts/platform/servisler/wsdl-semasi.mjs';
import { akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { WSDL } from './servis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Nesne = Record<string, any>;

// ---------------------------------------------------------------------------------------
// Saf
// ---------------------------------------------------------------------------------------

const tablo = (satirlar: Array<[string, Record<string, string | null>, string?]>, sutunlar = ['Kategori', 'Ürün'], gizli: string[] = []): Tablo => ({
  id: 't1', ad: 'Ürünler', guncellenme: '', sutunlar: sutunlar.map((ad) => ({ ad, gizli: gizli.includes(ad), tip: 'metin' })),
  satirlar: satirlar.map(([id, degerler, ortamId]) => ({ id, ad: id, ortamId: ortamId ?? null, degerler, doluGizli: [] }))
});

test.describe('saf: değişiklik, etki, karşılık', () => {
  const ESKI = tablo([['r1', { Kategori: 'K1', Ürün: 'Ürün A' }], ['r2', { Kategori: 'K2', Ürün: 'Ürün A' }], ['r3', { Kategori: 'K2', Ürün: 'Ürün C' }]]);

  test('hücre değişiklikleri: satır kimliğiyle, sütun yeniden adlandırılsa da; silinen satır / boşaltılan hücre null; eklenen değer sayılmaz', () => {
    const yeni = tablo([['r1', { Kategori: 'K1', Ad: 'Ürün X' }], ['r3', { Kategori: 'K2', Ad: null }], ['r4', { Kategori: 'K3', Ad: 'Yeni' }]], ['Kategori', 'Ad']);
    const tasima = sutunTasimasi(ESKI, [{ ad: 'Kategori' }, { ad: 'Ad', eskiAd: 'Ürün' }]);
    expect([...tasima]).toEqual([['Kategori', 'Kategori'], ['Ürün', 'Ad']]);
    expect(hucreDegisiklikleri(ESKI, yeni, tasima)).toEqual([
      { satirId: 'r1', satirAdi: 'r1', sutun: 'Ad', eski: 'Ürün A', yeni: 'Ürün X', gizli: false },
      { satirId: 'r2', satirAdi: 'r2', sutun: 'Kategori', eski: 'K2', yeni: null, gizli: false },
      { satirId: 'r2', satirAdi: 'r2', sutun: 'Ad', eski: 'Ürün A', yeni: null, gizli: false },
      { satirId: 'r3', satirAdi: 'r3', sutun: 'Ad', eski: 'Ürün C', yeni: null, gizli: false }
    ]);
  });

  test('değer etkisi: bağımlı listede diğer alanlar satırla uyuşmalı; eski değer uyuşan satırda hâlâ varsa etkilenmez; ortam; silindi / belirsiz', () => {
    const yeni = tablo([['r1', { Kategori: 'K1', Ürün: 'Ürün X' }], ['r2', { Kategori: 'K2', Ürün: 'Ürün A' }], ['r3', { Kategori: 'K2', Ürün: 'Ürün C' }]]);
    const tasima = sutunTasimasi(ESKI, [{ ad: 'Kategori' }, { ad: 'Ürün' }]);
    const c = { degisiklikler: hucreDegisiklikleri(ESKI, yeni, tasima), eskiSatirlar: eskiSatirlar(ESKI, tasima), yeni, ortamId: null };
    // K1 + Ürün A: değişen satırla uyuşur, yeni tabloda K1 + Ürün A yok → güncellenebilir.
    expect(degerEtkisi({ ...c, sutun: 'Ürün', deger: 'Ürün A', digerleri: [{ sutun: 'Kategori', deger: 'K1' }] })).toEqual({ durum: 'guncellenebilir', yeni: 'Ürün X' });
    // K2 + Ürün A: değişen satır (K1) bu senaryoyu ilgilendirmez.
    expect(degerEtkisi({ ...c, sutun: 'Ürün', deger: 'Ürün A', digerleri: [{ sutun: 'Kategori', deger: 'K2' }] })).toBeNull();
    // Tek başına Ürün A: r2'de hâlâ var → etkilenmez.
    expect(degerEtkisi({ ...c, sutun: 'Ürün', deger: 'Ürün A', digerleri: [] })).toBeNull();
    // Ortam: satır başka ortamdaysa etkilenmez.
    const ortamli = tablo([['r1', { Kategori: 'K1', Ürün: 'Ürün A' }, 'o2']]);
    const ortamliYeni = tablo([['r1', { Kategori: 'K1', Ürün: 'Ürün X' }, 'o2']]);
    const t2 = sutunTasimasi(ortamli, [{ ad: 'Kategori' }, { ad: 'Ürün' }]);
    const c2 = { degisiklikler: hucreDegisiklikleri(ortamli, ortamliYeni, t2), eskiSatirlar: eskiSatirlar(ortamli, t2), yeni: ortamliYeni, sutun: 'Ürün', deger: 'Ürün A', digerleri: [] };
    expect(degerEtkisi({ ...c2, ortamId: 'o1' })).toBeNull();
    expect(degerEtkisi({ ...c2, ortamId: 'o2' })).toEqual({ durum: 'guncellenebilir', yeni: 'Ürün X' });
    // Silinen satır → silindi; iki satır farklı yeni değer → belirsiz.
    const silindi = tablo([['r3', { Kategori: 'K2', Ürün: 'Ürün C' }]]);
    const c3 = { degisiklikler: hucreDegisiklikleri(ESKI, silindi, tasima), eskiSatirlar: eskiSatirlar(ESKI, tasima), yeni: silindi, ortamId: null, sutun: 'Ürün', deger: 'Ürün A', digerleri: [] };
    expect(degerEtkisi(c3)).toEqual({ durum: 'silindi' });
    const iki = tablo([['r1', { Kategori: 'K1', Ürün: 'Ürün X' }], ['r2', { Kategori: 'K2', Ürün: 'Ürün Y' }], ['r3', { Kategori: 'K2', Ürün: 'Ürün C' }]]);
    expect(degerEtkisi({ ...c3, degisiklikler: hucreDegisiklikleri(ESKI, iki, tasima), yeni: iki })).toEqual({ durum: 'belirsiz', yeniler: ['Ürün X', 'Ürün Y'] });
  });

  test('satır seçimi: koşulları tutan değişen satır varsa ve koşulları tutan satır kalmadıysa koşul yeni değere güncellenir', () => {
    const yeni = tablo([['r1', { Kategori: 'K1', Ürün: 'Ürün X' }], ['r2', { Kategori: 'K2', Ürün: 'Ürün A' }], ['r3', { Kategori: 'K2', Ürün: 'Ürün C' }]]);
    const tasima = sutunTasimasi(ESKI, [{ ad: 'Kategori' }, { ad: 'Ürün' }]);
    const c = { degisiklikler: hucreDegisiklikleri(ESKI, yeni, tasima), eskiSatirlar: eskiSatirlar(ESKI, tasima), yeni };
    expect(secimEtkisi({ ...c, kosullar: { Kategori: 'K1', Ürün: 'Ürün A' } })).toEqual({
      durum: 'guncellenebilir', yeniKosullar: { Kategori: 'K1', Ürün: 'Ürün X' }, degisenler: [{ sutun: 'Ürün', eski: 'Ürün A', yeni: 'Ürün X' }]
    });
    expect(secimEtkisi({ ...c, kosullar: { Ürün: 'Ürün A' } })).toBeNull(); // r2 hâlâ tutar
    expect(secimEtkisi({ ...c, kosullar: { Kategori: 'K2', Ürün: 'Ürün A' } })).toBeNull();
  });

  test('karşılıklar yeni değere taşınır; eski değer tabloda kalmadıysa eski anahtar silinir; yeni değerin kendi karşılığı korunur', () => {
    const eski: Tablo = { ...tablo([['r1', { Kanal: '100' }], ['r2', { Kanal: '200' }]], ['Kanal']) };
    const yeni: Tablo = { ...tablo([['r1', { Kanal: '101' }], ['r2', { Kanal: '201' }]], ['Kanal']) };
    yeni.sutunlar[0].karsiliklar = { 100: { servis: 'K-100' }, 200: { sayfa: '2' }, 201: { sayfa: 'kendi' } };
    const d = hucreDegisiklikleri(eski, yeni, sutunTasimasi(eski, [{ ad: 'Kanal' }]));
    const k = karsiliklariTasi(yeni, d);
    expect(k.sutunlar.get('Kanal')).toEqual({ 101: { servis: 'K-100' }, 201: { sayfa: 'kendi' } });
    expect(k.bilgi).toEqual([{ sutun: 'Kanal', eski: '100', yeni: '101' }]);
  });

  test('gövde: SOAP\'ta yalnız yoldaki öğenin metni değişir (kalanı birebir); çok eşleşme / bulunamaz nedenle döner; REST JSON / sorgu / yol', () => {
    const govde = '<s:Envelope xmlns:s="x">\n  <s:Body><Siparis xmlns="Ornek"><Input><Channel>100</Channel>  <Username>a&amp;b</Username><IdentityNumber>100</IdentityNumber></Input></Siparis></s:Body>\n</s:Envelope>';
    const r = soapDegeriniDegistir(govde, 'Input/Channel', '100', '1<01', 'Siparis');
    expect(r).toEqual({ sonuc: govde.replace('<Channel>100</Channel>', '<Channel>1&lt;01</Channel>') });
    expect(soapDegeriniDegistir(govde, 'Input/Username', 'a&b', 'c', 'Siparis')).toEqual({ sonuc: govde.replace('a&amp;b', 'c') });
    expect(soapDegeriniDegistir(govde, 'Input/Channel', '999', '1')).toEqual({ neden: GOVDE_NEDENLERI.bulunamadi });
    const iki = '<E><Body><T><Input><Kod>1</Kod></Input><Input><Kod>1</Kod></Input></T></Body></E>';
    expect(soapDegeriniDegistir(iki, 'Input/Kod', '1', '2', 'T')).toEqual({ neden: GOVDE_NEDENLERI.cokEslesme });
    const json = '{\n  "musteri": { "kanal": "100", "no": 5 },\n  "diger": { "kanal": "100" }\n}';
    expect(restDegeriniDegistir({ govde: json }, 'govde/musteri/kanal', '100', '101')).toEqual({ neden: GOVDE_NEDENLERI.cokEslesme });
    expect(restDegeriniDegistir({ govde: json }, 'govde/musteri/no', '5', '6')).toEqual({ sonuc: { govde: json.replace('"no": 5', '"no": 6') } });
    expect(restDegeriniDegistir({ govde: json }, 'govde/musteri/no', '5', 'x')).toEqual({ neden: GOVDE_NEDENLERI.sayiDegil });
    expect(restDegeriniDegistir({ govde: '', yol: '/k?kanal=100&x=100' }, 'sorgu/kanal', '100', '1 01')).toEqual({ sonuc: { govde: '', yol: '/k?kanal=1%2001&x=100' } });
    expect(restDegeriniDegistir({ govde: '', yol: '/k/100/detay?x=1' }, 'yol/id', '100', '101', '/k/{id}/detay')).toEqual({ sonuc: { govde: '', yol: '/k/101/detay?x=1' } });
  });
});

// ---------------------------------------------------------------------------------------
// Geçici veritabanı (süreç içi)
// ---------------------------------------------------------------------------------------

const GIZLI_ESKI = 'gizli-eski-7';
const GIZLI_YENI = 'gizli-yeni-8';
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n  <s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body>\n</s:Envelope>`;

/** Metin alanı eklenmiş model (üye kodu gizli sütuna bağlanır). */
function ekliPaket(): Nesne {
  const paket = akisPaketi() as Nesne;
  const model = akisModeli() as Nesne;
  (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push({
    id: 'uyeKodu', tip: 'metin', etiket: { ekran: 'Üye kodu' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'uyeKodu' }, konum: { secici: '#uyeKodu', kirilganlik: 'orta' }, zorunlu: false
  });
  paket.model = model;
  return paket;
}

interface Fikstur {
  projeId: string; ortamA: string; ortamB: string; ekranId: string; servisId: string;
  tablo: Record<'urunler' | 'planlar' | 'uyeler' | 'kanallar' | 'bos', string>;
  satir: Record<string, string>;
  senaryo: Record<string, string>;
}

/** Proje, ekran (bağlı alanlar), senaryolar, servis ve tablolar (ağ yok). */
async function kur(vt: Veritabani, klasor: string): Promise<Fikstur> {
  const projeId = projeKaydet(vt, { ad: 'Etki Projesi' });
  const ortamA = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
  const ortamB = ortamKaydet(vt, { projeId, ad: 'Diğer', tabanUrl: 'http://127.0.0.1:9', ayarlar: { riskli: false } });
  const { ekranId } = await sayfaEkle(vt, projeId, ekliPaket(), { senaryoIndeksleri: [], ortamIdleri: [ortamA], medyaKlasoru: join(klasor, 'medya') });
  const t = (ad: string, sutunlar: Nesne[], satirlar: Nesne[]) => tabloKaydet(vt, { projeId, ad, sutunlar, satirlar });
  const tablo = {
    urunler: t('Ürünler', [{ ad: 'Kategori' }, { ad: 'Ürün', karsiliklar: { 'Ürün A': { servis: 'URUN-A' } } }], [
      { ad: 'r1', degerler: { Kategori: 'K1', Ürün: 'Ürün A' } }, { ad: 'r2', degerler: { Kategori: 'K2', Ürün: 'Ürün A' } }, { ad: 'r3', degerler: { Kategori: 'K2', Ürün: 'Ürün C' } }]),
    planlar: t('Planlar', [{ ad: 'Plan' }], [{ ad: 'p2', degerler: { Plan: '2' } }, { ad: 'p3', degerler: { Plan: '3' } }]),
    uyeler: t('Üyeler', [{ ad: 'Ad' }, { ad: 'Kod', gizli: true }], [{ ad: 'u1', degerler: { Ad: 'Üye 1', Kod: GIZLI_ESKI } }]),
    kanallar: t('Kanallar', [{ ad: 'Kanal', karsiliklar: { 100: { servis: 'K-100' } } }, { ad: 'Kullanıcı' }], [
      { ad: 'k1', degerler: { Kanal: '100', Kullanıcı: 'kullanici100' } }, { ad: 'k2', degerler: { Kanal: '200', Kullanıcı: 'kullanici200' } }]),
    bos: t('Kullanılmayan', [{ ad: 'Değer' }], [{ ad: 'b1', degerler: { Değer: 'x' } }])
  };
  const satir: Record<string, string> = {};
  for (const x of tablolariListele(vt, projeId)) for (const r of x.satirlar) satir[r.ad] = r.id;
  ekranAlanBaglariniKaydet(vt, projeId, ekranId, {
    kategori: { tablo: tablo.urunler, sutun: 'Kategori' }, urun: { tablo: tablo.urunler, sutun: 'Ürün' }, plan: { tablo: tablo.planlar, sutun: 'Plan' },
    uyeKodu: { tablo: tablo.uyeler, sutun: 'Kod' }
  });
  const senaryo = (baslik: string, veri: Nesne, ek: Nesne = {}) => senaryoKaydet(vt, { projeId, ekranId, baslik, ortamIdleri: [ortamA, ortamB], veri: { baslik, ...veri }, ...ek }).id;
  const s = {
    S1: senaryo('K1 ürün A', { kategori: 'K1', urun: 'Ürün A' }),
    S2: senaryo('K2 ürün A', { kategori: 'K2', urun: 'Ürün A' }),
    S3: senaryo('K2 ürün C', { kategori: 'K2', urun: 'Ürün C', plan: '3' }),
    S4: senaryo('Satır seçimli', { kategori: '${Ürünler.Kategori}', urun: '${Ürünler.Ürün}' }, { tabloSecimleri: { [`${tablo.urunler}|`]: { Kategori: 'K1', Ürün: 'Ürün A' } } }),
    S5: senaryo('Üye kodlu', { kategori: 'K2', urun: 'Ürün C', uyeKodu: GIZLI_ESKI })
  };
  const servisId = servisKaydet(vt, { projeId, anahtar: 'ornek', ad: 'Ornek', ayarlar: {
    yol: '/Servis/ornek.asmx', operasyonlar: [{ ad: 'Siparis' }], operasyonSemalari: wsdlSemalari(WSDL),
    alanBaglari: { Siparis: { 'Input/Channel': { tablo: tablo.kanallar, sutun: 'Kanal' }, 'Input/Username': { tablo: tablo.kanallar, sutun: 'Kullanıcı' } } }
  } });
  const servisSenaryosu = (baslik: string, govde: string, ek: Nesne = {}) =>
    servisSenaryosuKaydet(vt, { projeId, servisId, baslik, icerik: { operasyon: 'Siparis', govde, kontroller: [{ tur: 'soapHatasiYok' }], ...ek } });
  const v = {
    SV1: servisSenaryosu('Kanal 100', zarf('<Channel>100</Channel><Username>kullanici100</Username>\n    <IdentityNumber>100</IdentityNumber>')),
    SV2: servisSenaryosu('Kanal 100 başka kullanıcı', zarf('<Channel>100</Channel><Username>kullanici200</Username>')),
    SV3: servisSenaryosu('Seçimli', zarf('<Channel>${Kanallar.Kanal}</Channel>'), { tabloSecimleri: { [`${tablo.kanallar}|`]: { Kanal: '100' } } })
  };
  return { projeId, ortamA, ortamB, ekranId, servisId, tablo, satir, senaryo: { ...s, ...v } };
}

/** Tablonun kayıt girdisi (sütunlar aynı adla) + değişen satırlar. */
function girdi(vt: Veritabani, f: Fikstur, tabloId: string, satirlar: Nesne[], ek: Nesne = {}) {
  const [t] = tablolariListele(vt, f.projeId, { tabloId });
  return { projeId: f.projeId, id: t.id, ad: t.ad, sutunlar: t.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli })), satirlar, ...ek };
}
const gecmis = (vt: Veritabani, id: string) => Number(vt.tek('SELECT COUNT(*) AS n FROM degisiklik_gecmisi WHERE varlik_id = ?', [id])?.n ?? 0);
const bul = (e: Etkilenen[], senaryoId: string, nitelik: 'alan' | 'secim' = 'alan') => e.find((x) => x.senaryoId === senaryoId && x.nitelik === nitelik);

test.describe('geçici veritabanı: etki ve onaylı güncelleme', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let f: Fikstur;

  test.beforeEach(async () => {
    klasor = geciciKlasor('tablo-etkisi');
    mkdirSync(join(klasor.yol, 'medya'));
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Etki-Kasa-Parolasi-9', { kdf: HIZLI_KDF });
    f = await kur(vt, klasor.yol);
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });

  const urunDegistir = (ek: Nesne = {}) => girdi(vt, f, f.tablo.urunler, [{ id: f.satir.r1, degerler: { Kategori: 'K1', Ürün: 'Ürün X' } }], ek);

  test('denetle: ekran alanı (her iki ortam) + satır seçimi etkilenir, bağımlı listede uyuşmayan satır etkilemez; hiçbir şey yazılmaz', () => {
    const onceki = JSON.stringify(tablolariListele(vt, f.projeId));
    const gecmisOnce = Object.values(f.senaryo).map((id) => gecmis(vt, id));
    const s = tabloKaydetEtkiyle(vt, urunDegistir({ etki: 'denetle' }));
    expect(s.onayGerekli).toBe(true);
    expect(s.etki.degisiklikler).toEqual([{ tablo: 'Ürünler', satir: 'r1', sutun: 'Ürün', gizli: false, eski: 'Ürün A', yeni: 'Ürün X' }]);
    const e = s.etki.etkilenenler;
    expect(e.map((x) => [x.baslik, x.nitelik]).sort()).toEqual([['K1 ürün A', 'alan'], ['Satır seçimli', 'secim']]);
    expect(bul(e, f.senaryo.S1)).toMatchObject({ tur: 'ekran', kaynakAdi: 'Başvuru (akış)', eski: 'Ürün A', yeni: 'Ürün X', durum: 'guncellenebilir', ortamlar: ['Deneme', 'Diğer'] });
    expect(bul(e, f.senaryo.S4, 'secim')).toMatchObject({ alan: 'Satır seçimi: Ürünler', eski: 'Ürün = Ürün A', yeni: 'Ürün = Ürün X', durum: 'guncellenebilir' });
    // Karşılık: "Ürün A" r2'de kaldığı için eski anahtar da kalır, yeni değere kopyalanır.
    expect(s.etki.karsiliklar).toEqual([{ tablo: 'Ürünler', sutun: 'Ürün', eski: 'Ürün A', yeni: 'Ürün X' }]);
    expect(JSON.stringify(tablolariListele(vt, f.projeId))).toBe(onceki);
    expect(Object.values(f.senaryo).map((id) => gecmis(vt, id))).toEqual(gecmisOnce);
  });

  test('uygula: yalnız seçilen senaryolar yazılır (ortam başına), değişiklik geçmişine düşer; karşılık taşınır', () => {
    const d = tabloKaydetEtkiyle(vt, urunDegistir({ etki: 'denetle' }));
    const s1 = bul(d.etki.etkilenenler, f.senaryo.S1) as Etkilenen;
    const g1 = gecmis(vt, f.senaryo.S1);
    const g4 = gecmis(vt, f.senaryo.S4);
    const s = tabloKaydetEtkiyle(vt, urunDegistir({ etki: 'uygula', guncellenecekler: [s1.anahtar] }));
    expect(s.guncelleme).toEqual({ guncellenenSenaryo: 1, guncellenenAlan: 1, atlananlar: [], uyari: 0 });
    for (const o of [f.ortamA, f.ortamB]) expect(senaryoDetayi(vt, f.senaryo.S1, o).veri).toMatchObject({ kategori: 'K1', urun: 'Ürün X' });
    expect(gecmis(vt, f.senaryo.S1)).toBe(g1 + 1);
    expect(gecmis(vt, f.senaryo.S4)).toBe(g4);
    expect(senaryoDetayi(vt, f.senaryo.S4, f.ortamA).tabloSecimleri).toEqual({ [`${f.tablo.urunler}|`]: { Kategori: 'K1', Ürün: 'Ürün A' } });
    expect(senaryoDetayi(vt, f.senaryo.S2, f.ortamA).veri).toMatchObject({ urun: 'Ürün A' });
    const [t] = tablolariListele(vt, f.projeId, { tabloId: f.tablo.urunler });
    expect(t.satirlar.find((r) => r.id === f.satir.r1)?.degerler.Ürün).toBe('Ürün X');
    expect(t.sutunlar.find((x) => x.ad === 'Ürün')?.karsiliklar).toEqual({ 'Ürün A': { servis: 'URUN-A' }, 'Ürün X': { servis: 'URUN-A' } });
  });

  test('yalnız tabloyu kaydet: senaryolara dokunmaz', () => {
    const once = [f.senaryo.S1, f.senaryo.S4].map((id) => [JSON.stringify(senaryoDetayi(vt, id, f.ortamA)), gecmis(vt, id)]);
    const s = tabloKaydetEtkiyle(vt, urunDegistir({ etki: 'uygula', guncellenecekler: [] }));
    expect(s.guncelleme).toMatchObject({ guncellenenSenaryo: 0, atlananlar: [] });
    expect([f.senaryo.S1, f.senaryo.S4].map((id) => [JSON.stringify(senaryoDetayi(vt, id, f.ortamA)), gecmis(vt, id)])).toEqual(once);
    expect(tablolariListele(vt, f.projeId, { tabloId: f.tablo.urunler })[0].satirlar[0].degerler.Ürün).toBe('Ürün X');
  });

  test('tek işlem: yazım sırasında hata → tablo da senaryolar da yazılmaz', () => {
    const onceki = JSON.stringify(tablolariListele(vt, f.projeId));
    const d = tabloKaydetEtkiyle(vt, girdi(vt, f, f.tablo.urunler, [{ id: f.satir.r1, degerler: { Kategori: 'K1', Ürün: 'Ürün X' } }], { etki: 'denetle' }));
    // "K1 ürün A" yazıldıktan SONRA ikinci senaryonun ("Satır seçimli") yazımı hata verir: koşu denetimi planda bir kez, yazımdan
    // önce ikinci kez çağrılır; ikinci çağrıda fırlatır.
    const g1 = gecmis(vt, f.senaryo.S1);
    let cagri = 0;
    const kosuyorMu = (_dosya: string, ad: string) => {
      if (ad === 'Satır seçimli' && ++cagri === 2) throw new Error('yazım hatası (test)');
      return false;
    };
    expect(() => tabloKaydetEtkiyle(vt, girdi(vt, f, f.tablo.urunler, [{ id: f.satir.r1, degerler: { Kategori: 'K1', Ürün: 'Ürün X' } }], {
      etki: 'uygula', guncellenecekler: d.etki.etkilenenler.map((x) => x.anahtar)
    }), { kosuyorMu })).toThrow('yazım hatası (test)');
    expect(cagri).toBe(2);
    expect(JSON.stringify(tablolariListele(vt, f.projeId))).toBe(onceki);
    expect(gecmis(vt, f.senaryo.S1)).toBe(g1);
    expect(senaryoDetayi(vt, f.senaryo.S1, f.ortamA).veri).toMatchObject({ urun: 'Ürün A' });
  });

  test('servis: bağlı alanın düz değeri ve satır seçimi; gövdede yalnız ilgili öğe değişir; bağımlı kullanıcı uyuşmazsa etkilenmez', () => {
    const g = girdi(vt, f, f.tablo.kanallar, [{ id: f.satir.k1, degerler: { Kanal: '101', Kullanıcı: 'kullanici100' } }]);
    const d = tabloKaydetEtkiyle(vt, { ...g, etki: 'denetle' });
    expect(d.onayGerekli).toBe(true);
    const e = d.etki.etkilenenler;
    expect(e.map((x) => x.baslik).sort()).toEqual(['Kanal 100', 'Seçimli']);
    expect(bul(e, f.senaryo.SV1)).toMatchObject({ tur: 'servis', kaynakAdi: 'Ornek', alan: 'Input/Channel', eski: '100', yeni: '101', durum: 'guncellenebilir' });
    expect(bul(e, f.senaryo.SV3, 'secim')).toMatchObject({ eski: 'Kanal = 100', yeni: 'Kanal = 101' });
    const onceki = servisSenaryosuGetir(vt, f.senaryo.SV1)?.icerik.govde as string;
    const g1 = gecmis(vt, f.senaryo.SV1);
    const s = tabloKaydetEtkiyle(vt, { ...g, etki: 'uygula', guncellenecekler: e.map((x) => x.anahtar) });
    expect(s.guncelleme).toMatchObject({ guncellenenSenaryo: 2, atlananlar: [] });
    expect(servisSenaryosuGetir(vt, f.senaryo.SV1)?.icerik.govde).toBe(onceki.replace('<Channel>100</Channel>', '<Channel>101</Channel>'));
    expect(servisSenaryosuGetir(vt, f.senaryo.SV2)?.icerik.govde).toContain('<Channel>100</Channel>');
    expect(servisSenaryosuGetir(vt, f.senaryo.SV3)?.icerik.tabloSecimleri).toEqual({ [`${f.tablo.kanallar}|`]: { Kanal: '101' } });
    expect(gecmis(vt, f.senaryo.SV1)).toBe(g1 + 1);
    // Karşılık: 100 artık tabloda yok → 101'e taşınır.
    expect(tablolariListele(vt, f.projeId, { tabloId: f.tablo.kanallar })[0].sutunlar[0].karsiliklar).toEqual({ 101: { servis: 'K-100' } });
  });

  test('gizli sütun: değerler hiçbir yanıtta görünmez (•••); onayla yeni değer yazılır', () => {
    const g = girdi(vt, f, f.tablo.uyeler, [{ id: f.satir.u1, degerler: { Ad: 'Üye 1', Kod: GIZLI_YENI } }]);
    const d = tabloKaydetEtkiyle(vt, { ...g, etki: 'denetle' });
    const metin = JSON.stringify(d);
    expect(metin).not.toContain(GIZLI_ESKI);
    expect(metin).not.toContain(GIZLI_YENI);
    expect(d.etki.degisiklikler).toEqual([{ tablo: 'Üyeler', satir: 'u1', sutun: 'Kod', gizli: true, eski: MASKE, yeni: MASKE }]);
    const x = bul(d.etki.etkilenenler, f.senaryo.S5) as Etkilenen;
    expect(x).toMatchObject({ gizli: true, eski: MASKE, yeni: MASKE, durum: 'guncellenebilir' });
    const s = tabloKaydetEtkiyle(vt, { ...g, etki: 'uygula', guncellenecekler: [x.anahtar] });
    expect(JSON.stringify(s)).not.toContain(GIZLI_YENI);
    expect(senaryoDetayi(vt, f.senaryo.S5, f.ortamB).veri).toMatchObject({ uyeKodu: GIZLI_YENI });
  });

  test('silinen değer: uyarı olarak listelenir, güncellenmez; koşan senaryo atlanır; etki yoksa doğrudan kaydedilir', () => {
    const sil = girdi(vt, f, f.tablo.planlar, [], { silinenSatirlar: [f.satir.p3] });
    const d = tabloKaydetEtkiyle(vt, { ...sil, etki: 'denetle' });
    expect(d.etki.etkilenenler).toEqual([expect.objectContaining({ senaryoId: f.senaryo.S3, alan: 'Plan', eski: '3', yeni: null, durum: 'silindi-uyari' })]);
    const g3 = gecmis(vt, f.senaryo.S3);
    const s = tabloKaydetEtkiyle(vt, { ...sil, etki: 'uygula', guncellenecekler: d.etki.etkilenenler.map((x) => x.anahtar) });
    expect(s.guncelleme).toMatchObject({ guncellenenSenaryo: 0, uyari: 1, atlananlar: [] });
    expect(gecmis(vt, f.senaryo.S3)).toBe(g3);
    // Koşan senaryo: durum "koşuyor", güncellenmez ve bildirilir.
    const k = tabloKaydetEtkiyle(vt, urunDegistir({ etki: 'denetle' }), { kosuyorMu: () => true });
    expect(bul(k.etki.etkilenenler, f.senaryo.S1)).toMatchObject({ durum: 'kosuyor' });
    const u = tabloKaydetEtkiyle(vt, urunDegistir({ etki: 'uygula', guncellenecekler: k.etki.etkilenenler.map((x) => x.anahtar) }), { kosuyorMu: () => true });
    expect(u.guncelleme?.guncellenenSenaryo).toBe(0);
    expect(u.guncelleme?.atlananlar.map((x) => x.baslik).sort()).toEqual(['K1 ürün A', 'Satır seçimli']);
    // Kullanılmayan değer: onay istenmez, kaydedilir.
    const b = tabloKaydetEtkiyle(vt, girdi(vt, f, f.tablo.bos, [{ id: f.satir.b1, degerler: { Değer: 'y' } }], { etki: 'denetle' }));
    expect(b.onayGerekli).toBeUndefined();
    expect(tablolariListele(vt, f.projeId, { tabloId: f.tablo.bos })[0].satirlar[0].degerler.Değer).toBe('y');
  });
});

// ---------------------------------------------------------------------------------------
// Arayüz (ayrı Nöbetçi, 127.0.0.1)
// ---------------------------------------------------------------------------------------

test.describe('arayüz: tablo kaydında onay penceresi', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Etki-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let f: Fikstur;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablo-etkisi-arayuz-'));
    mkdirSync(join(klasor, 'medya'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    f = await kur(vt, klasor);
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

  test('Kaydet → pencere (masaüstü + 390px, taşma yok) → yalnız işaretli senaryo güncellenir; etki yoksa pencere çıkmaz', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/veri');
    const liste = page.getByRole('navigation', { name: 'Tablolar' });
    await liste.getByRole('button', { name: /^Ürünler/ }).click();
    await page.getByRole('textbox', { name: '1. satır Ürün', exact: true }).fill('Ürün X');
    await page.getByRole('region', { name: 'Tablo düzenleyici' }).getByRole('button', { name: 'Kaydet', exact: true }).click();
    const diyalog = page.getByRole('dialog', { name: 'Değişen değerler senaryolarda kullanılıyor' });
    await expect(diyalog).toBeVisible();
    await expect(diyalog).toContainText('"Ürün A" değeri 1 senaryoda kullanılıyor (Ekran Başvuru (akış): 1) — bunları da "Ürün X" yapayım mı?');
    await expect(diyalog).toContainText('K1 ürün A');
    await expect(diyalog).toContainText('Satır seçimli');
    await expect(diyalog).toContainText('Karşılıklar yeni değere taşınır');
    await expect(diyalog).toContainText('Satır seçimi Ürün = Ürün A 1 senaryoda (Ekran Başvuru (akış): 1) — Ürün = Ürün X olarak güncelleyeyim mi?');
    await expect(diyalog).not.toContainText('K2 ürün A');
    await page.waitForTimeout(400); // açılış geçişi
    await page.screenshot({ path: test.info().outputPath('tablo-etkisi.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(diyalog).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: test.info().outputPath('tablo-etkisi-telefon.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    expect(await diyalog.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
    // Düğmeler ekranın içinde (yatay ve dikey; gövde kayar, alt çubuk hep görünür).
    for (const ad of ['Tabloyu kaydet ve seçili senaryoları güncelle', 'Yalnız tabloyu kaydet', 'Vazgeç']) {
      const k = await diyalog.getByRole('button', { name: ad }).boundingBox();
      expect(k && k.x >= 0 && k.x + k.width <= 390 && k.y >= 0 && k.y + k.height <= 844, ad).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    // Satır seçimli senaryonun işaretini kaldır; yalnız "K1 ürün A" güncellenir.
    await diyalog.getByRole('checkbox', { name: /^Satır seçimli · / }).uncheck();
    await expect(diyalog).toContainText('1 / 2 seçili');
    await diyalog.getByRole('button', { name: 'Tabloyu kaydet ve seçili senaryoları güncelle' }).click();
    await expect(page.locator('.bildirim').last()).toContainText('"Ürünler" kaydedildi; 1 senaryo güncellendi.');
    await expect(diyalog).toBeHidden();
    const detay = async (id: string) => (await nobetciApi(nobetci, `/platform/senaryo?id=${id}&ortamId=${f.ortamB}`) as Nesne).senaryo as Nesne;
    expect((await detay(f.senaryo.S1)).veri.urun).toBe('Ürün X');
    expect((await detay(f.senaryo.S4)).tabloSecimleri).toEqual({ [`${f.tablo.urunler}|`]: { Kategori: 'K1', Ürün: 'Ürün A' } });
    // Etki yok: pencere çıkmaz, doğrudan kaydedilir.
    await liste.getByRole('button', { name: /^Kullanılmayan/ }).click();
    await page.getByRole('textbox', { name: '1. satır Değer', exact: true }).fill('z');
    await page.getByRole('region', { name: 'Tablo düzenleyici' }).getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('.bildirim').last()).toContainText('"Kullanılmayan" kaydedildi.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Silinen değer: yalnız uyarı; güncelleme düğmesi yok, "Yalnız tabloyu kaydet" / "Vazgeç".
    await liste.getByRole('button', { name: /^Planlar/ }).click();
    await page.getByRole('button', { name: '2. satırı sil' }).click();
    await page.getByRole('region', { name: 'Tablo düzenleyici' }).getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(diyalog).toBeVisible();
    await expect(diyalog).toContainText('1 senaryo silinen değeri kullanıyor; koşuda hata verebilir');
    await expect(diyalog).toContainText('K2 ürün C');
    await expect(diyalog.getByRole('button', { name: 'Tabloyu kaydet ve seçili senaryoları güncelle' })).toHaveCount(0);
    await diyalog.getByRole('button', { name: 'Yalnız tabloyu kaydet' }).click();
    await expect(page.locator('.bildirim').last()).toContainText('"Planlar" kaydedildi. 1 senaryo silinen değeri kullanıyor.');
    expect((await detay(f.senaryo.S3)).veri.plan).toBe('3');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
