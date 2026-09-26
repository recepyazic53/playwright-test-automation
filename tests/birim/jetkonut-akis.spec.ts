// UÇTAN UCA (yerel) — "JetKonut (akış)" paketi (projeler/galaksi/jetkonut-akis.mjs): koddaki JetKonut teklif akışının
// model koşucusu karşılığı. "Ödeme (teklif kaydet + kredi kartı)" ortak akışı ve paket (girişsiz; yerel havuz adlarıyla)
// Nöbetçi'ye yüklenir, kimlik ve kart profilleri kurulur, formdan senaryolar kaydedilip JetKonut benzeri fikstüre
// (jetkonut-akis-fikstur.ts) karşı koşulur: özel / tüzel sigortalı, aynı / farklı sigorta ettiren, telefon kodu + numarası,
// kimlik sorgusu (detay görünene kadar), UAVT sorgusu ve örtü, gizli (jqTransform) listeler, mal sahibi / kiracı alanları,
// Standart → Sonraki Adım → teminatlar → teklif, iş kuralı uyarısı, ödeme dahil / değil.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { jetKonutAkisPaketi, JETKONUT_HAVUZLARI, teklifKaydetOdemeAkisPaketi } from '../../projeler/galaksi/jetkonut-akis.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { KONUT_INSA_YILI_UYARISI, KONUT_ODEME_SONUCU, KonutUygulamasi } from './jetkonut-akis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Konut-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' };
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const TC2 = { tcKimlikNo: '10000000278', dogumTarihi: '03.04.1985', cepTelefonu: '5339998877' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5324445566' };
const VKN2 = { vergiKimlikNo: '9876543210', cepTelefonu: '5325556677' };
/** Kodlu testin JSON'undaki gibi riziko / teminat değerleri (fikstür listelerinin GÖRÜNEN METİNLERİ: jqTransform). */
const ORTAK_VERI = {
  sigortaliTelefonKodu: '532', sigortaliTelefonNo: '1112233', adresKodu: '1234567890',
  binaTipi: 'Apartman', brutYuzolcum: '120', daskaBagli: 'evet', dainiMurtehin: 'yok', alternatifPlus: 'Plus Yok', alternatif: 'Alternatif 2',
  yapiTarzi: 'Betonarme', toplamKat: '4 - 7 Kat', rizikonunBulunduguKat: '5. Kat', catiTipi: 'Kiremit Çatı', altmisGundenFazlaBos: 'hayir', binaInsaYili: '2005',
  binaYangin: '500000', esyaYangin: '150000', dahiliDekorasyonYangin: '20000', camKirilmasi: '5000',
  esyaDeprem: true, dahiliDekorasyonDeprem: false, hirsizlik: true, binaSabitKiymetHirsizlik: false,
  ferdiKazaTekLimit: 'Ferdi Kaza 5.000', hukuksalKoruma: 'Hukuksal Koruma Var', enflasyonOrani: 'Enflasyon %50'
};

let nobetci: Nobetci;
let uygulama: KonutUygulamasi;
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
  klasor = mkdtempSync(join(tmpdir(), 'jetkonut-akis-'));
  uygulama = new KonutUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Konut Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  const tur = async (ad: string, alanlar: string[]): Promise<string> =>
    String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((x) => ({ ad: x, hassas: true })) })).id);
  const profil = async (turId: string, ad: string, degerler: Nesne): Promise<void> => { await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId, ad, degerler }); };
  const ozel = await tur(HAVUZLAR.ozel, ['tcKimlikNo', 'dogumTarihi', 'cepTelefonu']);
  await profil(ozel, 'tc1', TC1);
  await profil(ozel, 'tc2', TC2);
  const tuzel = await tur(HAVUZLAR.tuzel, ['vergiKimlikNo', 'cepTelefonu']);
  await profil(tuzel, 'vkn1', VKN1);
  await profil(tuzel, 'vkn2', VKN2);
  await profil(await tur('Kredi kartı', ['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']), 'ortak', {
    isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', guvenlikKodu: '123',
    sonKullanmaAyi: JSON.stringify({ deger: '3', metin: '03' }), sonKullanmaYili: JSON.stringify({ deger: '2030', metin: '2030' })
  });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: teklifKaydetOdemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetKonutAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true, odeme: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetKonut (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli (ödemesiz) üretilir, doğrulamadan geçer; ödeme ortak akışı "Teklif Kaydet" ile başlar', async () => {
  const p = jetKonutAkisPaketi();
  expect(sayfaPaketiniDogrula(p, {})).toMatchObject({ gecerli: true });
  expect(p.gerekenAyarlar).toMatchObject({ girisGerekli: true, baglamTurleri: ['Acente'] });
  expect(JSON.stringify(p.model)).toContain(JETKONUT_HAVUZLARI.tuzel);
  const odeme = teklifKaydetOdemeAkisPaketi();
  expect(sayfaPaketiniDogrula(odeme, {})).toMatchObject({ gecerli: true });
  expect(odeme.model).toMatchObject({ tur: 'ortakAkis', yalnizTestOrtami: true });
  expect((odeme.model.adimlar as Nesne[]).map((a) => a.id)).toEqual(['teklifKaydet', 'kartFormu', 'odeme']);
  expect((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`))).toMatchObject({ duzenlenebilir: true });
});

test('özel / aynı / mal sahibi + ödeme: telefon kodu + numarası, sorgu, UAVT, gizli listeler, teminatlar, teklif ve ödeme', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Sigortalı Özel / Sigorta Ettiren Aynı / Mal Sahibi', { sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaliDurumu: 'malSahibi', odemeAdimiDahil: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.teklifler.at(-1)).toEqual({
    tip: 'O', kod: '532', tel: '1112233', dogum: TC1.dogumTarihi, no: TC1.tcKimlikNo, ad: 'KİŞİ 146', farkli: 'H', ettiren: null,
    ak: ORTAK_VERI.adresKodu, dr: 'D890', baslangic: bugun(), sahiplik: 'E', binaTipi: '1', alan: '120', daskaBagli: 'E', dainiMurtehin: 'H',
    alternatifPlus: '0', alternatif: '2', yapiTarzi: '1', toplamKat: '2', bulunduguKat: '5', catiTipi: '2', bos60: 'H', insaYili: '2005',
    teminat: {
      bina: '500000', esya: '150000', dekorasyon: '20000', cam: '5000', esyaDeprem: true, dekorasyonDeprem: false, hirsizlik: true, sabitKiymet: false,
      ferdiKaza: '5000', hukuksal: '1', enflasyon: '50'
    }
  });
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.odemeler[0]).toMatchObject({ kartNo: '1111222233334444', ay: '3', yil: '2030' });
  expect(KONUT_ODEME_SONUCU).toBe('Hiçbir poliçe onaylanamadı.');
});

test('tüzel / farklı özel / kiracı, ödemesiz: VKN sorgulanır, ettiren (özel) doğum tarihiyle sorgulanır; mal sahibi alanları atlanır', async () => {
  test.setTimeout(150_000);
  const odemeOnce = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Sigortalı Tüzel / Sigorta Ettiren Farklı Özel / Kiracı', {
    sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaEttiren: 'farkli', ettirenTipi: 'ozel', ettirenProfili: 'tc2',
    ettirenTelefonKodu: '533', ettirenTelefonNo: '9998877', sigortaliDurumu: 'kiraci'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.teklifler.at(-1)).toMatchObject({
    tip: 'T', dogum: null, no: VKN1.vergiKimlikNo, ad: 'UNVAN 890 A.Ş.', farkli: 'E',
    ettiren: { tip: 'O', kod: '533', tel: '9998877', dogum: TC2.dogumTarihi, no: TC2.tcKimlikNo, ad: 'KİŞİ 278' },
    sahiplik: 'H', alan: null, daskaBagli: null, teminat: { bina: null, esya: '150000' }
  });
  expect(uygulama.odemeler).toHaveLength(odemeOnce);
});

test('özel / farklı tüzel: iş kuralı uyarısı teklif adımında beklenir ("JetKonut Hızlı Teklif Ekranı" penceresi)', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Sigortalı Özel / Sigorta Ettiren Farklı Tüzel / İnşa yılı uyarısı', {
    sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaEttiren: 'farkli', ettirenTipi: 'tuzel', ettirenProfili: 'vkn2',
    ettirenTelefonKodu: '532', ettirenTelefonNo: '5556677', sigortaliDurumu: 'malSahibi', binaInsaYili: '1940', odemeAdimiDahil: true,
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'teklif', mesaj: KONUT_INSA_YILI_UYARISI }
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.teklifler.at(-1)).toMatchObject({ ettiren: { tip: 'T', dogum: null, no: VKN2.vergiKimlikNo, ad: 'UNVAN 210 A.Ş.' }, insaYili: '1940' });
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
