// UÇTAN UCA (yerel) — "JetKOBİ (akış)" paketi (projeler/galaksi/jetkobi-akis.mjs): koddaki JetKOBİ teklif akışının
// model koşucusu karşılığı. "Ödeme (teklif kaydet + kredi kartı)" ortak akışı ve paket (girişsiz; yerel havuz adlarıyla)
// Nöbetçi'ye yüklenir, kimlik ve kart profilleri kurulur, formdan senaryolar kaydedilip JetKOBİ benzeri fikstüre
// (jetkobi-akis-fikstur.ts) karşı koşulur: özel / tüzel sigortalı, aynı / farklı özel / farklı tüzel sigorta ettiren,
// mal sahibi / kiracı (koşullu alanlar), iki parçalı telefon, kimlik sorguları, UAVT + yükleme perdesi, jqTransform listeleri
// ve sonradan yüklenen iştigal cinsleri, teminat ekranına geçiş, teklif, ödeme dahil / değil ve teklif iş kuralı hatası.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { jetKobiAkisPaketi, JETKOBI_HAVUZLARI, teklifKaydetOdemeAkisPaketi } from '../../projeler/galaksi/jetkobi-akis.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { KOBI_ODEME_SONUCU, KOBI_TEKLIF_HATASI, KobiUygulamasi } from './jetkobi-akis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Kobi-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' };
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const TC2 = { tcKimlikNo: '10000000278', dogumTarihi: '03.04.1985', cepTelefonu: '5334445566' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5324445566' };
/** Kodlu testin JSON'undaki gibi riziko / teminat değerleri (listelerde fikstür listelerinin görünen metinleri). */
const ORTAK_VERI = {
  sigortaliTelefonKodu: '532', sigortaliTelefonNo: '1112233', adresKodu: '1234567890',
  binaTipi: 'Betonarme bina', brutYuzolcum: '150', daskaBagli: 'evet', dainiMurtehin: 'yok', isciSayisi: '4',
  isverenMaliMesuliyeti: '250.000 TL (işveren)', ucuncuSahisMaliMesuliyeti: '100.000 TL (3. şahıs)', yapiTarzi: 'Çelik, Betonarme Karkas',
  istigalTipi: 'İmalat', istigalCinsi: 'Gıda imalatı', toplamKat: '4 - 7 Kat', rizikonunBulunduguKat: 'Birinci kat', catiTipi: 'Kiremit çatı',
  binaInsaYili: '2005', ferdiKazaTeminati: 'Ferdi kaza yok',
  binaYangin: '1000000', sigortaliyaAitEmtea: '250000', ucuncuSahsaAitEmtea: '0', demirbas: '50000', makine: '75000', kasa: '0',
  dahiliDekorasyon: '20000', urunSorumluluk: '0', isDurmasi: '0', dekorasyonHirsizlik: '0', camKirilmasi: '5000', yanginVeGuvenlikOnlemleri: 'Yangın tüpü'
};
const BEKLENEN_RIZIKO = {
  ak: ORTAK_VERI.adresKodu, dr: ORTAK_VERI.adresKodu, dainiMurtehin: 'H', isci: '4', ucret: '1000000', isveren: '20', ucuncu: '10', yapi: '1',
  istigalTipi: '2', istigalCinsi: '202', toplamKat: '2', kat: '1', cati: '2', insaYili: '2005', ferdiKaza: '0'
};

let nobetci: Nobetci;
let uygulama: KobiUygulamasi;
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
  klasor = mkdtempSync(join(tmpdir(), 'jetkobi-akis-'));
  uygulama = new KobiUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'KOBİ Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  const tur = async (ad: string, alanlar: string[]): Promise<string> =>
    String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((x) => ({ ad: x, hassas: true })) })).id);
  const profil = async (turId: string, ad: string, degerler: Nesne): Promise<void> => { await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad, degerler }); };
  const ozelTur = await tur(HAVUZLAR.ozel, ['tcKimlikNo', 'dogumTarihi', 'cepTelefonu']);
  await profil(ozelTur, 'tc1', TC1);
  await profil(ozelTur, 'tc2', TC2);
  await profil(await tur(HAVUZLAR.tuzel, ['vergiKimlikNo', 'cepTelefonu']), 'vkn1', VKN1);
  await profil(await tur('Kredi kartı', ['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']), 'ortak', {
    isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', guvenlikKodu: '123',
    sonKullanmaAyi: JSON.stringify({ deger: '3', metin: '03' }), sonKullanmaYili: JSON.stringify({ deger: '2030', metin: '2030' })
  });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: teklifKaydetOdemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetKobiAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true, odeme: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetKOBİ (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli (ödemesiz) üretilir, doğrulamadan geçer; ödeme ortak akışı Teklif Kaydet ile başlar', async () => {
  const p = jetKobiAkisPaketi();
  expect(sayfaPaketiniDogrula(p, {})).toMatchObject({ gecerli: true });
  expect(p.gerekenAyarlar).toMatchObject({ girisGerekli: true, baglamTurleri: ['Acente'] });
  expect(JSON.stringify(p.model)).toContain(JETKOBI_HAVUZLARI.tuzel);
  const odeme = teklifKaydetOdemeAkisPaketi();
  expect(sayfaPaketiniDogrula(odeme, {})).toMatchObject({ gecerli: true });
  const adimlar = (odeme.model as { adimlar: Array<{ id: string }>; yalnizTestOrtami: boolean });
  expect(adimlar.adimlar.map((a) => a.id)).toEqual(['teklifKaydet', 'kartFormu', 'odeme']);
  expect(adimlar.yalnizTestOrtami).toBe(true);
  expect((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`))).toMatchObject({ duzenlenebilir: true });
});

test('özel / aynı / mal sahibi + ödeme: telefon iki parça, sorgu, UAVT, jqTransform listeleri, iştigal cinsi, teminatlar, teklif ve ödeme', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Sigortalı Özel / Sigorta Ettiren Aynı / Mal Sahibi', {
    sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaEttiren: 'ayni', sigortaliDurumu: 'malSahibi', odemeAdimiDahil: true
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.standartlar.at(-1)).toEqual({
    tip: 'O', kod: '532', tel: '1112233', dogum: TC1.dogumTarihi, no: TC1.tcKimlikNo, ad: 'KİŞİ 146', farkli: 'H', ettiren: null,
    baslangic: bugun(), malSahibi: 'E', bina: { tip: '1', alan: '150', dask: 'E' }, ...BEKLENEN_RIZIKO
  });
  expect(uygulama.teklifler.at(-1)).toMatchObject({ C1000: '1000000', C1225: '250000', C1036: '5000', onlemler: 'Yangın tüpü' });
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.odemeler[0]).toMatchObject({ kartNo: '1111222233334444', ay: '3', yil: '2030' });
  expect(KOBI_ODEME_SONUCU).toBe('Hiçbir poliçe onaylanamadı.');
});

test('tüzel / farklı özel / kiracı, ödemesiz: doğum tarihi atlanır, ettiren sorgulanır, mal sahibi alanları atlanır; ödeme yapılmaz', async () => {
  test.setTimeout(150_000);
  const odemeOnce = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Sigortalı Tüzel / Sigorta Ettiren Farklı Özel / Kiracı', {
    sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaliTelefonKodu: '532', sigortaliTelefonNo: '4445566',
    sigortaEttiren: 'farkli', sigortaEttirenTipi: 'ozel', sigortaEttirenProfili: 'tc2', sigortaEttirenTelefonKodu: '533', sigortaEttirenTelefonNo: '4445566',
    sigortaliDurumu: 'kiraci'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.standartlar.at(-1)).toMatchObject({
    tip: 'T', kod: '532', tel: '4445566', dogum: null, no: VKN1.vergiKimlikNo, ad: 'UNVAN 890 A.Ş.', farkli: 'E',
    ettiren: { tip: 'O', kod: '533', tel: '4445566', dogum: TC2.dogumTarihi, no: TC2.tcKimlikNo, ad: 'KİŞİ 278' }, malSahibi: 'H', bina: null, ...BEKLENEN_RIZIKO
  });
  expect(uygulama.odemeler).toHaveLength(odemeOnce);
});

test('özel / farklı tüzel / mal sahibi: teklifte beklenen iş kuralı hatası hata penceresinden okunur', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Sigortalı Özel / Sigorta Ettiren Farklı Tüzel / Mal Sahibi / Yangın 0', {
    sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaEttiren: 'farkli', sigortaEttirenTipi: 'tuzel', sigortaEttirenProfili: 'vkn1',
    sigortaEttirenTelefonKodu: '532', sigortaEttirenTelefonNo: '4445566', sigortaliDurumu: 'malSahibi', binaYangin: '0', odemeAdimiDahil: true,
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'teklif', mesaj: KOBI_TEKLIF_HATASI }
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.standartlar.at(-1)).toMatchObject({
    tip: 'O', farkli: 'E', ettiren: { tip: 'T', dogum: null, no: VKN1.vergiKimlikNo, ad: 'UNVAN 890 A.Ş.' }, bina: { tip: '1', alan: '150', dask: 'E' }
  });
  expect(uygulama.teklifler.at(-1)).toMatchObject({ C1000: '0' });
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
