// UÇTAN UCA (yerel) — "JetSağlık (akış)" paketi (projeler/galaksi/jetsaglik-akis.mjs): koddaki JetSağlık yeni iş akışının
// model koşucusu karşılığı. Ödeme ortak akışı ve paket (girişsiz; yerel havuz adlarıyla) Nöbetçi'ye yüklenir, kimlik, adres ve
// kart profilleri kurulur, formdan senaryolar kaydedilip JetSağlık benzeri fikstüre (jetsaglik-akis-fikstur.ts) karşı koşulur:
// yabancı kimlik / pasaport sigortalı (türe göre alanlar, sorgu, pasaport ayrıntıları, sorgudan sonra telefonun yeniden
// girilmesi), sigorta ettiren kendisi / farklı özel / tüzel / pasaport, pasaportta adres profili, yabancı kimlikte eksik adres,
// poliçe listeleri, prim. Bilinen motor eksikleri de sabitlenir: gizli alanlar (#Yenileme, pasaportlu ettiren telefonu) atlanır;
// ödeme ortak akışının "Kart formu açılır" adımı JetSağlık'ta (kart formu doğrudan açılır) düşer.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { jetSaglikAkisPaketi, JETSAGLIK_HAVUZLARI } from '../../projeler/galaksi/jetsaglik-akis.mjs';
import { dogrudanKartOdemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { SAGLIK_ESKI_TELEFON, SaglikUygulamasi } from './jetsaglik-akis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Saglik-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', pasaport: 'Pasaport', yabanciKimlik: 'Yabancı kimlik', adres: 'Adres', acente: 'Acente' };
const YK1 = { yabanciKimlikNo: '99000000012', dogumTarihi: '03.04.1985', uyruk: 'ALMANYA', cepTelefonu: '5321112233' };
const PAS1 = {
  pasaportNo: 'U12345678', dogumTarihi: '05.06.1980', uyruk: 'ALMANYA', cepTelefonu: '5327778899',
  ad: 'DENEME', soyad: 'YOLCU', babaAdi: 'BABA', dogumYeri: 'BERLIN', cinsiyet: 'kadin'
};
const PAS2 = { ...PAS1, pasaportNo: 'F87654321', uyruk: 'FRANSA', cepTelefonu: '5326665544', ad: 'IKINCI', cinsiyet: 'erkek' };
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5324445566' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5323334455' };
const secimJson = (deger: string, metin: string): string => JSON.stringify({ deger, metin });
const ADRES1 = {
  il: secimJson('34', 'İSTANBUL'), ilce: secimJson('1183', 'ÜSKÜDAR'), belde: secimJson('2', 'KÖY'), cadde: 'Deneme Caddesi', sokak: 'Deneme Sokak',
  adresTipi: secimJson('2', 'Site'), adresParcasi: 'A', mahalle: 'Deneme Mahallesi', binaNo: '7', blokKodu: 'B', siteAdi: 'Deneme Sitesi', daireNo: '3', kat: '2'
};
/** Kodlu testin JSON'undaki gibi poliçe değerleri (fikstür listelerinin değerleri); yenileme "E" verilir ama alan gizli. */
const ORTAK_VERI = { policeSuresi: '12', hastalik: 'H', kvkkOnayi: '1', yenileme: 'E', indirimOrani: '5' };
/** Yabancı kimlikte sorgudan eksik gelen adres (kodlu POM'un tamamladığı değerler). */
const EKSIK_ADRES = { eksikBelde: '1', eksikMahalle: 'Test Mahallesi', eksikCadde: 'Test Caddesi' };

let nobetci: Nobetci;
let uygulama: SaglikUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
async function kaydetVeKos(baslik: string, veri: Nesne): Promise<Nesne> {
  const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...ORTAK_VERI, ...veri } });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
  return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
}
const atlananlar = (sonuc: Nesne): string[] => ((sonuc.atlananAlanlar ?? []) as Array<{ alan: string }>).map((a) => a.alan);
const bugun = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'jetsaglik-akis-'));
  uygulama = new SaglikUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Sağlık Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  const tur = async (ad: string, alanlar: string[]): Promise<string> =>
    String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((x) => ({ ad: x, hassas: true })) })).id);
  const profil = async (turId: string, ad: string, degerler: Nesne): Promise<void> => { await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad, degerler }); };
  await profil(await tur(HAVUZLAR.yabanciKimlik, Object.keys(YK1)), 'yk1', YK1);
  const pasaportTuru = await tur(HAVUZLAR.pasaport, Object.keys(PAS1));
  await profil(pasaportTuru, 'pas1', PAS1);
  await profil(pasaportTuru, 'pas2', PAS2);
  await profil(await tur(HAVUZLAR.ozel, Object.keys(TC1)), 'tc1', TC1);
  await profil(await tur(HAVUZLAR.tuzel, Object.keys(VKN1)), 'vkn1', VKN1);
  await profil(await tur(HAVUZLAR.adres, Object.keys(ADRES1)), 'adres1', ADRES1);
  await profil(await tur('Kredi kartı', ['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']), 'ortak', {
    isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', guvenlikKodu: '123',
    sonKullanmaAyi: secimJson('3', '03'), sonKullanmaYili: secimJson('2030', '2030')
  });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: dogrudanKartOdemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetSaglikAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true, odeme: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetSağlık (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli (ödemesiz) üretilir, doğrulamadan geçer; akış diyagramda düzenlenebilir', async () => {
  const p = jetSaglikAkisPaketi();
  expect(sayfaPaketiniDogrula(p, {})).toMatchObject({ gecerli: true });
  expect(p.gerekenAyarlar).toMatchObject({ girisGerekli: true, baglamTurleri: ['Acente'] });
  const metin = JSON.stringify(p.model);
  for (const havuz of [JETSAGLIK_HAVUZLARI.yabanciKimlik, JETSAGLIK_HAVUZLARI.pasaport, JETSAGLIK_HAVUZLARI.adres]) expect(metin).toContain(havuz);
  expect((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`))).toMatchObject({ duzenlenebilir: true });
});

test('yabancı kimlik / kendisi: sorgu, telefon yeniden girilir, eksik adres tamamlanır, prim; gizli #Yenileme atlanır', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Sigortalı Yabancı Kimlik / Sigorta Ettiren Kendisi', {
    sigortaliTipi: 'yabanciKimlik', sigortaliProfili: 'yk1', farkliMusteri: 'kendisi', ...EKSIK_ADRES
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    sigortaliTip: 'O', ulkeKodu: '90', tel: YK1.cepTelefonu, dogum: YK1.dogumTarihi, yabanciNo: YK1.yabanciKimlikNo, uyruk: null, ad: 'KİŞİ 012',
    farkli: 'H', ettirenTip: null, adres: { il: '34', ilce: '1103', belde: '1', mahalle: 'Test Mahallesi', cadde: 'Test Caddesi' },
    baslangic: bugun(), sure: '12', hastalik: 'H', kvkk: '1', indirim: '5',
    // Motor eksiği: gizli liste doldurulmaz, ekranın varsayılanı kalır.
    yenileme: 'H'
  });
  expect(atlananlar(sonuc)).toContain('Yenileme');
});

test('pasaport / farklı özel: pasaport ayrıntıları ve adres profili girilir, ettiren T.C. sorgulanır, telefonlar yeniden girilir', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Sigortalı Pasaport / Sigorta Ettiren Farklı Özel', {
    sigortaliTipi: 'pasaport', sigortaliProfili: 'pas1', sigortaliAdresProfili: 'adres1', farkliMusteri: 'farkli', musteriTipi: 'ozel', ettirenProfili: 'tc1'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    sigortaliTip: 'P', tel: PAS1.cepTelefonu, dogum: null, uyruk: 'DE', pasaportNo: PAS1.pasaportNo, ad: PAS1.ad,
    pasaport: { ad: PAS1.ad, soyad: PAS1.soyad, baba: PAS1.babaAdi, dogum: PAS1.dogumTarihi, yer: PAS1.dogumYeri, cinsiyet: 'K' },
    farkli: 'E', ettirenTip: 'O', ettirenUlkeKodu: '90', ettirenTel: TC1.cepTelefonu, ettirenDogum: TC1.dogumTarihi, ettirenNo: TC1.tcKimlikNo, ettirenAd: 'KİŞİ 146',
    adres: {
      il: '34', ilce: '1183', belde: '2', cadde: ADRES1.cadde, sokak: ADRES1.sokak, adresTipi: '2', parca: 'A', mahalle: ADRES1.mahalle,
      binaNo: '7', blok: 'B', site: ADRES1.siteAdi, daire: '3', kat: '2'
    }
  });
  expect(JSON.stringify(uygulama.hesaplamalar.at(-1))).not.toContain(SAGLIK_ESKI_TELEFON);
});

test('yabancı kimlik / farklı tüzel: VKN sorgulanır, doğum tarihi atlanır', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Sigortalı Yabancı Kimlik / Sigorta Ettiren Farklı Tüzel', {
    sigortaliTipi: 'yabanciKimlik', sigortaliProfili: 'yk1', farkliMusteri: 'farkli', musteriTipi: 'tuzel', ettirenProfili: 'vkn1', ...EKSIK_ADRES
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    sigortaliTip: 'O', farkli: 'E', ettirenTip: 'T', ettirenTel: VKN1.cepTelefonu, ettirenDogum: null, ettirenNo: VKN1.vergiKimlikNo, ettirenAd: 'UNVAN 890 A.Ş.'
  });
});

test('pasaport / farklı pasaport: ettiren pasaportu sorgulanır; gizli telefon satırı atlanır (motor eksiği)', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Sigortalı Pasaport / Sigorta Ettiren Farklı Pasaport', {
    sigortaliTipi: 'pasaport', sigortaliProfili: 'pas1', sigortaliAdresProfili: 'adres1', farkliMusteri: 'farkli', musteriTipi: 'pasaport', ettirenProfili: 'pas2'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    farkli: 'E', ettirenTip: 'P', ettirenUyruk: 'FR', ettirenPasaportNo: PAS2.pasaportNo, ettirenAd: PAS2.ad,
    ettirenPasaport: { ad: PAS2.ad, cinsiyet: 'E', dogum: PAS2.dogumTarihi },
    // Gerçek hesaplama servisi bu telefonu zorunlu tutuyor (POM); koşucu gizli satırı dolduramaz.
    ettirenTel: '', ettirenUlkeKodu: ''
  });
  expect(atlananlar(sonuc).some((a) => a.includes('Cep telefonu'))).toBe(true);
});

test('ödeme dahil: prim hesaplanır; "Ödeme (doğrudan kart formu)" ile Poliçeleştir\'den sonra kart formu doğrudan doldurulur ve ödenir', async () => {
  test.setTimeout(150_000);
  const hesapOnce = uygulama.hesaplamalar.length;
  const sonuc = await kaydetVeKos('Sigortalı Yabancı Kimlik / Sigorta Ettiren Kendisi / Ödeme', {
    sigortaliTipi: 'yabanciKimlik', sigortaliProfili: 'yk1', ...EKSIK_ADRES, odemeAdimiDahil: true
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.length).toBe(hesapOnce + 1);
  const adimlar = ((sonuc.adimlar ?? []) as Array<{ ad?: string }>).map((a) => a.ad);
  expect(adimlar).toEqual(expect.arrayContaining(['Poliçeleştirilir', 'Kart bilgileri girilir, ödeme tamamlanır']));
  expect(adimlar).not.toContain('Kart formu açılır');
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
