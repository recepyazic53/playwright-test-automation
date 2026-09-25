// UÇTAN UCA (yerel) — "JetKasko (akış)" paketi (projeler/galaksi/jetkasko-akis.mjs): koddaki JetKasko YK (yeni kayıt)
// akışının model koşucusu karşılığı. Ödeme ortak akışı ve paket (girişsiz; yerel havuz adlarıyla) Nöbetçi'ye yüklenir, kimlik
// ve kart profilleri kurulur, formdan senaryolar kaydedilip JetKasko benzeri fikstüre (jetkasko-akis-fikstur.ts) karşı koşulur:
// özel / tüzel sigortalı (tüzelde doğum tarihi atlanır), "YK" plaka + sorgu, sigorta ettiren kendisi / farklı özel / farklı
// tüzel (sorgu sonucu beklenir), model yılı → marka listesi, marka kodu sorgusu, araç tipine bağlı yavaş sınıf listesi,
// tescil tarihi = bugün, yetkili indirimi (isteğe bağlı; iş kuralı hatası), kademeli gelen ürünlerden ADIYLA seçim (kısa kod /
// varsayılan), ödeme dahil / değil.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { jetKaskoAkisPaketi, JETKASKO_HAVUZLARI } from '../../projeler/galaksi/jetkasko-akis.mjs';
import { odemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { KASKO_INDIRIM_HATASI, KASKO_ODEME_SONUCU, KaskoUygulamasi } from './jetkasko-akis-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Kasko-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' };
// Açıkça sahte değerler.
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const TC2 = { tcKimlikNo: '20000000246', dogumTarihi: '03.04.1985', cepTelefonu: '5324445566' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5327778899' };
const VKN2 = { vergiKimlikNo: '9876543210', cepTelefonu: '5320001122' };
/** Kodlu verideki "araclar" sözlüğünün karşılığı (fikstür listelerinin değerleri). */
const OZEL_OTOMOBIL = { plakaIlKodu: '34', plakaNo: 'YK', modelYili: '2024', markaKodu: '123456', motorNo: 'MOTOR-001', sasiNo: 'SASI-001', aracTipi: '1', sinif: '11', kullanim: '1' };
const KAMYON = { plakaIlKodu: '06', plakaNo: 'YK', modelYili: '2023', markaKodu: '654321', motorNo: 'MOTOR-002', sasiNo: 'SASI-002', aracTipi: 'Kamyon', sinif: '22', kullanim: 'Ticari' };

let nobetci: Nobetci;
let uygulama: KaskoUygulamasi;
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
  const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
  return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
}
const bugun = (): string => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'jetkasko-akis-'));
  uygulama = new KaskoUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Kasko Projesi' })).proje as Nesne).id);
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
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: odemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetKaskoAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true, odeme: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetKasko (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli (ödemesiz) üretilir, doğrulamadan geçer; akış diyagramda düzenlenebilir', async () => {
  const p = jetKaskoAkisPaketi();
  expect(sayfaPaketiniDogrula(p, {})).toMatchObject({ gecerli: true });
  expect(p.gerekenAyarlar).toMatchObject({ girisGerekli: true, baglamTurleri: ['Acente'] });
  expect(JSON.stringify(p.model)).toContain(JETKASKO_HAVUZLARI.tuzel);
  expect((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`))).toMatchObject({ duzenlenebilir: true });
});

test('özel / kendisi / özel otomobil + ödeme: YK sorgusu, marka kodu, sınıf listesi beklenir; varsayılan ürün adıyla seçilir ve ödenir', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Özel Otomobil / Özel / Kendisi', { sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaEttiren: 'ayni', ...OZEL_OTOMOBIL, odemeAdimiDahil: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toEqual({
    tip: 'O', no: TC1.tcKimlikNo, dogum: TC1.dogumTarihi, tel: TC1.cepTelefonu, il: '34', plaka: 'YK', ad: 'KİŞİ 146', ettiren: 'H',
    ettirenTipi: null, ettirenNo: null, ettirenAd: null, modelYili: '2024', marka: '123', model: '123456', motor: 'MOTOR-001', sasi: 'SASI-001',
    tescil: bugun(), aracTipi: '1', sinif: '11', kullanim: '1', indirim: ''
  });
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.odemeler[0]).toMatchObject({ urun: 'GENİŞLETİLMİŞ KASKO(YOL YARD.)', kartNo: '1111222233334444', ay: '3', yil: '2030' });
  expect(KASKO_ODEME_SONUCU).toBe('Hiçbir poliçe onaylanamadı.');
});

test('tüzel / farklı özel / kamyon, ödemesiz: doğum tarihi atlanır, ettiren sorgulanır, liste metinle seçilir, yetkili indirimi girilir', async () => {
  test.setTimeout(150_000);
  const odemeOnce = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Kamyon / Tüzel / Farklı Özel', {
    sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaEttiren: 'farkli', sigortaEttirenTipi: 'ozel', sigortaEttirenProfili: 'tc2',
    ...KAMYON, yetkiliIndirimi: '10', urun: '2'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    tip: 'T', no: VKN1.vergiKimlikNo, dogum: null, tel: VKN1.cepTelefonu, il: '06', ad: 'UNVAN 890 A.Ş.', ettiren: 'E', ettirenTipi: 'O',
    ettirenNo: TC2.tcKimlikNo, ettirenAd: 'ETTİREN KİŞİ 246', aracTipi: '2', sinif: '22', kullanim: '2', indirim: '10'
  });
  expect(uygulama.sorgular.filter((x) => x.tur === 'ettiren').at(-1)).toMatchObject({ tip: 'O', dogum: TC2.dogumTarihi, tel: TC2.cepTelefonu });
  expect(uygulama.odemeler).toHaveLength(odemeOnce);
});

test('özel / farklı tüzel + ödeme: ürün kısa koduyla, ekranda ADIYLA seçilir (radyo değeri karışık olsa da)', async () => {
  test.setTimeout(150_000);
  const sonuc = await kaydetVeKos('Özel Otomobil / Özel / Farklı Tüzel', {
    sigortaliTipi: 'ozel', sigortaliProfili: 'tc2', sigortaEttiren: 'farkli', sigortaEttirenTipi: 'tuzel', sigortaEttirenProfili: 'vkn2',
    ...OZEL_OTOMOBIL, urun: '5', odemeAdimiDahil: true
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ tip: 'O', no: TC2.tcKimlikNo, ettiren: 'E', ettirenTipi: 'T', ettirenNo: VKN2.vergiKimlikNo, ettirenAd: 'ETTİREN UNVAN 210' });
  expect(uygulama.sorgular.filter((x) => x.tur === 'ettiren').at(-1)).toMatchObject({ tip: 'T', dogum: '' });
  expect(uygulama.odemeler.at(-1)).toMatchObject({ urun: 'GÜLÜMSETEN KASKO(İKAME+YOL YARD.)' });
});

test('iş kuralı hatası: yetkili indirimi fazla → prim hesaplamada beklenen hata penceresi (beklenen sonuç sağlanır)', async () => {
  test.setTimeout(120_000);
  const hesapOnce = uygulama.hesaplamalar.length;
  const sonuc = await kaydetVeKos('Özel Otomobil / İndirim Hatası', {
    sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaEttiren: 'ayni', ...OZEL_OTOMOBIL, yetkiliIndirimi: '25',
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'primHesaplama', mesaj: "Yetkili indirimi %20'yi geçemez" }
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar).toHaveLength(hesapOnce + 1);
  expect(KASKO_INDIRIM_HATASI).toContain('%20');
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
