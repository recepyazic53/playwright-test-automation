// UÇTAN UCA (yerel) — "JetİlkAteşKonut (akış)" paketi (projeler/galaksi/jetilkateskonut-akis.mjs): koddaki Jet İlk Ateş
// Konut teklif akışının model koşucusu karşılığı. "Ödeme (teklif kaydet + kredi kartı)" ortak akışı ve paket (girişsiz; yerel
// havuz adlarıyla) Nöbetçi'ye yüklenir, kimlik ve kart profilleri kurulur, formdan senaryolar kaydedilip Jet İlk Ateş benzeri
// fikstüre (jetilkateskonut-akis-fikstur.ts) karşı koşulur: özel / tüzel sigortalı, aynı / farklı sigorta ettiren, kimlik
// sorgusu, UAVT sorgusu ve örtü, gizli (jqTransform) alternatif listesi ve görünür yapı tarzı listesi, mal sahibi / kiracı,
// "Standart" → "Prim … ₺", iş kuralı uyarısı (.modal), id'siz "Teklif Kaydet" düğmesiyle ödeme dahil / değil.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { jetIlkAtesKonutAkisPaketi, JETILKATESKONUT_HAVUZLARI } from '../../projeler/galaksi/jetilkateskonut-akis.mjs';
import { teklifKaydetOdemeAkisPaketi } from '../../projeler/galaksi/jetkonut-akis.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { FIRE_INSA_YILI_UYARISI, FIRE_ODEME_SONUCU, FireUygulamasi } from './jetilkateskonut-akis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Fire-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' };
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5324445566' };
const VKN2 = { vergiKimlikNo: '9876543210', cepTelefonu: '5325556677' };
/** Kodlu testin JSON'undaki gibi değerler: alternatif gizli listeden METİNLE, yapı tarzı görünür listeden DEĞERLE. */
const ORTAK_VERI = {
  sigortaliTelefonKodu: '532', sigortaliTelefonNo: '1112233', adresKodu: '1234567890',
  alternatif: 'Geniş Paket', yapiTarzi: '2', binaInsaYili: '2010'
};

let nobetci: Nobetci;
let uygulama: FireUygulamasi;
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
  klasor = mkdtempSync(join(tmpdir(), 'jetilkateskonut-akis-'));
  uygulama = new FireUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'İlk Ateş Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  const tur = async (ad: string, alanlar: string[]): Promise<string> =>
    String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((x) => ({ ad: x, hassas: true })) })).id);
  const profil = async (turId: string, ad: string, degerler: Nesne): Promise<void> => { await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad, degerler }); };
  await profil(await tur(HAVUZLAR.ozel, ['tcKimlikNo', 'dogumTarihi', 'cepTelefonu']), 'tc1', TC1);
  const tuzel = await tur(HAVUZLAR.tuzel, ['vergiKimlikNo', 'cepTelefonu']);
  await profil(tuzel, 'vkn1', VKN1);
  await profil(tuzel, 'vkn2', VKN2);
  await profil(await tur('Kredi kartı', ['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']), 'ortak', {
    isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', guvenlikKodu: '123',
    sonKullanmaAyi: JSON.stringify({ deger: '3', metin: '03' }), sonKullanmaYili: JSON.stringify({ deger: '2030', metin: '2030' })
  });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: teklifKaydetOdemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetIlkAtesKonutAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true, odeme: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetİlkAteşKonut (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli (ödemesiz) üretilir, doğrulamadan geçer; akış diyagramda düzenlenebilir', async () => {
  const p = jetIlkAtesKonutAkisPaketi();
  expect(sayfaPaketiniDogrula(p, {})).toMatchObject({ gecerli: true });
  expect(p.gerekenAyarlar).toMatchObject({ girisGerekli: true, baglamTurleri: ['Acente'] });
  expect(JSON.stringify(p.model)).toContain(JETILKATESKONUT_HAVUZLARI.ozel);
  expect((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`))).toMatchObject({ duzenlenebilir: true });
});

test('özel / aynı / mal sahibi + ödeme: sorgu, UAVT, gizli alternatif (metinle), yapı tarzı (değerle), prim ve id\'siz "Teklif Kaydet" ile ödeme', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Sigortalı Özel / Sigorta Ettiren Aynı / Mal Sahibi', { sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaliDurumu: 'malSahibi', odemeAdimiDahil: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.teklifler.at(-1)).toEqual({
    tip: 'O', kod: '532', tel: '1112233', dogum: TC1.dogumTarihi, no: TC1.tcKimlikNo, ad: 'KİŞİ 146', farkli: 'H', ettiren: null,
    ak: ORTAK_VERI.adresKodu, il: '34', dr: 'D890', baslangic: bugun(), sahiplik: 'E',
    alternatif: '2', esyaYangin: '100000', ekTeminat: '25000', yapiTarzi: '2', insaYili: '2010'
  });
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.odemeler[0]).toMatchObject({ kartNo: '1111222233334444', ay: '3', yil: '2030' });
  expect(FIRE_ODEME_SONUCU).toBe('Hiçbir poliçe onaylanamadı.');
});

test('tüzel / farklı tüzel / kiracı, ödemesiz: doğum tarihleri atlanır, iki VKN sorgulanır; ödeme yapılmaz', async () => {
  test.setTimeout(150_000);
  const odemeOnce = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Sigortalı Tüzel / Sigorta Ettiren Farklı Tüzel / Kiracı', {
    sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaEttiren: 'farkli', ettirenTipi: 'tuzel', ettirenProfili: 'vkn2',
    ettirenTelefonKodu: '532', ettirenTelefonNo: '5556677', sigortaliDurumu: 'kiraci', alternatif: 'Ekonomik Paket', yapiTarzi: 'Betonarme Karkas'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.teklifler.at(-1)).toMatchObject({
    tip: 'T', dogum: null, no: VKN1.vergiKimlikNo, ad: 'UNVAN 890 A.Ş.', farkli: 'E',
    ettiren: { tip: 'T', kod: '532', tel: '5556677', dogum: null, no: VKN2.vergiKimlikNo, ad: 'UNVAN 210 A.Ş.' },
    sahiplik: 'H', alternatif: '1', esyaYangin: '50000', yapiTarzi: '1'
  });
  expect(uygulama.odemeler).toHaveLength(odemeOnce);
});

test('iş kuralı uyarısı teklif adımında beklenir (hata penceresi); ödeme adımına geçilmez', async () => {
  test.setTimeout(150_000);
  const odemeOnce = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Sigortalı Özel / İnşa yılı uyarısı', {
    sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaliDurumu: 'malSahibi', binaInsaYili: '1940', odemeAdimiDahil: true,
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'teklif', mesaj: 'bina inşa yılı 1950 öncesi olamaz' }
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.teklifler.at(-1)).toMatchObject({ insaYili: '1940' });
  expect(FIRE_INSA_YILI_UYARISI).toContain('1950 öncesi');
  expect(uygulama.odemeler).toHaveLength(odemeOnce);
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
