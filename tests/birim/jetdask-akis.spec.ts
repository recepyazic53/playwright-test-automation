// UÇTAN UCA (yerel) — "JetDASK (akış)" paketi (projeler/galaksi/jetdask-akis.mjs): koddaki JetDASK yeni iş akışının
// model koşucusu karşılığı. Ödeme ortak akışı ve paket (girişsiz; yerel havuz adlarıyla) Nöbetçi'ye yüklenir, kimlik ve kart
// profilleri kurulur, formdan senaryolar kaydedilip JetDASK benzeri fikstüre (jetdask-akis-fikstur.ts) karşı koşulur:
// özel / tüzel / pasaport sigortalı (türe göre doğum tarihi, uyruk, sorgu düğmesi), "Aranıyor" bitene kadar bekleme ve
// sorgudan sonra telefonun yeniden girilmesi, UAVT adres sorgusu, tapu / poliçe alanları, prim, ödeme dahil / değil.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { jetDaskAkisPaketi, JETDASK_HAVUZLARI } from '../../projeler/galaksi/jetdask-akis.mjs';
import { dogrudanKartOdemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { DASK_ODEME_SONUCU, DaskUygulamasi } from './jetdask-akis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Dask-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', pasaport: 'Pasaport', acente: 'Acente' };
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5324445566' };
const PAS1 = { pasaportNo: 'U12345678', dogumTarihi: '05.06.1980', uyruk: 'ALMANYA', cepTelefonu: '5327778899' };
/** Kodlu testin JSON'undaki gibi adres / tapu / poliçe değerleri (fikstür listelerinin değerleri). */
const ORTAK_VERI = {
  sigortaEttirenSifati: '1', adresKodu: '1234567890', ada: '101', sayfaNo: '12', pafta: '3', bagimsizBolum: '4', parsel: '5',
  brutYuzolcum: '120', kullanimSekli: '5', insaTarzi: '4', insaYili: '10', toplamKat: '5', oncekiHasar: '0', bulunduguKat: '3'
};

let nobetci: Nobetci;
let uygulama: DaskUygulamasi;
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
const bugun = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'jetdask-akis-'));
  uygulama = new DaskUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'DASK Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  const tur = async (ad: string, alanlar: string[]): Promise<string> =>
    String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((x) => ({ ad: x, hassas: true })) })).id);
  const profil = async (turId: string, ad: string, degerler: Nesne): Promise<void> => { await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad, degerler }); };
  await profil(await tur(HAVUZLAR.ozel, ['tcKimlikNo', 'dogumTarihi', 'cepTelefonu']), 'tc1', TC1);
  await profil(await tur(HAVUZLAR.tuzel, ['vergiKimlikNo', 'cepTelefonu']), 'vkn1', VKN1);
  await profil(await tur(HAVUZLAR.pasaport, ['pasaportNo', 'dogumTarihi', 'uyruk', 'cepTelefonu']), 'pas1', PAS1);
  await profil(await tur('Kredi kartı', ['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']), 'ortak', {
    isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', guvenlikKodu: '123',
    sonKullanmaAyi: JSON.stringify({ deger: '3', metin: '03' }), sonKullanmaYili: JSON.stringify({ deger: '2030', metin: '2030' })
  });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: dogrudanKartOdemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetDaskAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true, odeme: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetDASK (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli (ödemesiz) üretilir, doğrulamadan geçer; akış diyagramda düzenlenebilir', async () => {
  const p = jetDaskAkisPaketi();
  expect(sayfaPaketiniDogrula(p, {})).toMatchObject({ gecerli: true });
  expect(p.gerekenAyarlar).toMatchObject({ girisGerekli: true, baglamTurleri: ['Acente'] });
  expect(JSON.stringify(p.model)).toContain(JETDASK_HAVUZLARI.pasaport);
  expect((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`))).toMatchObject({ duzenlenebilir: true });
});

test('özel / mal sahibi + ödeme: sorgu bitene kadar beklenir, telefon sorgudan sonra yeniden girilir; UAVT, tapu, poliçe, prim ve ödeme', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Sigortalı Özel / Mal Sahibi', { sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', odemeAdimiDahil: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toEqual({
    yenileme: 'H', tip: 'O', ulkeKodu: '90', tel: TC1.cepTelefonu, dogum: TC1.dogumTarihi, uyruk: null, no: TC1.tcKimlikNo, ad: 'KİŞİ 146',
    sifat: '1', ak: ORTAK_VERI.adresKodu, dr: ORTAK_VERI.adresKodu, tapu: ['101', '12', '3', '4', '5'], baslangic: bugun(), alan: '120',
    kullanim: '5', insa: '4', yil: '10', kat: '5', hasar: '0', bulunduguKat: '3', dainiMurtehin: 'Y'
  });
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.odemeler[0]).toMatchObject({ kartNo: '1111222233334444', ay: '3', yil: '2030' });
  expect(DASK_ODEME_SONUCU).toBe('Hiçbir poliçe onaylanamadı.');
});

test('tüzel / kiracı, ödemesiz: doğum tarihi ve uyruk atlanır, VKN sorgulanır; ödeme yapılmaz', async () => {
  test.setTimeout(120_000);
  const odemeOnce = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Sigortalı Tüzel / Kiracı', { sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaEttirenSifati: '2' });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ tip: 'T', tel: VKN1.cepTelefonu, dogum: null, uyruk: null, no: VKN1.vergiKimlikNo, ad: 'UNVAN 890 A.Ş.', sifat: '2' });
  expect(uygulama.odemeler).toHaveLength(odemeOnce);
});

test('pasaport / mal sahibi: uyruk metniyle seçilir, pasaport sorgu düğmesi kullanılır', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Sigortalı Pasaport / Mal Sahibi', { sigortaliTipi: 'pasaport', sigortaliProfili: 'pas1' });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ tip: 'P', tel: PAS1.cepTelefonu, dogum: PAS1.dogumTarihi, uyruk: 'DE', no: PAS1.pasaportNo, ad: 'KİŞİ 678' });
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
