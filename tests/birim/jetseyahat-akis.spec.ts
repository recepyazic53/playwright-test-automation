// UÇTAN UCA (yerel) — "JetSeyahat (akış)" paketi (projeler/galaksi/jetseyahat-akis.mjs): koddaki JetSeyahat prim
// hesaplama akışının model koşucusu karşılığı. Paket (girişsiz sürümü; yerel havuz adlarıyla) Nöbetçi'ye sayfa paketi
// olarak yüklenir, test verisi türleri + kimlik profilleri kurulur, formdan dört senaryo kaydedilir ve Nöbetçi'nin koşu
// ucundan JetSeyahat benzeri fikstüre (jetseyahat-akis-fikstur.ts) karşı koşulur:
//   tekli / aynı ettiren (hazır kimlik profili, bugün / bugün+7, varsayılanlar, kayak) · tekli / farklı tüzel (VKN profili,
//   kimlik sorgusu) · çoklu (Excel, liste dolana kadar bekleme) / farklı özel (senaryoya özel yeni kimlik) · iş kuralı.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez; ayrı Nöbetçi örneği geçici veritabanıyla çalışır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { goreliTarih, modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { GALAKSI_HAVUZLARI, jetSeyahatAkisPaketi } from '../../projeler/galaksi/jetseyahat-akis.mjs';
import { mesajIceriyorMu } from '../support/beklenen-sonuc';
import { modelFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { adimlardanBloklar, akisDuzenlenebilirMi, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { AVRUPA_ULKELERI, DUNYA_ULKELERI } from '../../projeler/galaksi/jetseyahat-secenekler.mjs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { KIMLIK_UYARISI, ODEME_SONUCU, SEYAHAT_IS_KURALI, SeyahatUygulamasi } from './jetseyahat-akis-fikstur';
import { odemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Seyahat-${randomBytes(6).toString('hex')}`;
const HAVUZLAR = { ozel: 'Özel kişi', tuzel: 'Tüzel kişi', acente: 'Acente' };
const TC1 = { tcKimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' };
const VKN1 = { vergiKimlikNo: '1234567890', cepTelefonu: '5324445566' };
const YENI_OZEL = { tcKimlikNo: '20000000046', dogumTarihi: '03.04.1985', cepTelefonu: '5327778899' };

let nobetci: Nobetci;
let uygulama: SeyahatUygulamasi;
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

/** Senaryoyu formdan kaydeder ve koşar; sonucun ayrıntısını döndürür. */
async function kaydetVeKos(baslik: string, veri: Nesne, ekran = ekranId): Promise<Nesne> {
  const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId: ekran, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
  return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'jetseyahat-akis-'));
  const yukleme = join(klasor, 'yuklenecek');
  mkdirSync(yukleme);
  writeFileSync(join(yukleme, 'sigortali-listesi.xlsx'), 'sahte excel');
  uygulama = new SeyahatUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_YUKLEME_KLASORU: yukleme });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Seyahat Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  // Kimlik profilleri: havuz adıyla aynı adlı test verisi türleri (elle oluşturulan projede tanım yok).
  const ozel = String((await basarili('/platform/test-verisi-turu/kaydet', {
    projeId, ad: HAVUZLAR.ozel, alanlar: ['tcKimlikNo', 'dogumTarihi', 'cepTelefonu'].map((ad) => ({ ad, hassas: true }))
  })).id);
  const tuzel = String((await basarili('/platform/test-verisi-turu/kaydet', {
    projeId, ad: HAVUZLAR.tuzel, alanlar: ['vergiKimlikNo', 'cepTelefonu'].map((ad) => ({ ad, hassas: true }))
  })).id);
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: ozel, ad: 'tc1', degerler: TC1 });
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tuzel, ad: 'vkn1', degerler: VKN1 });
  await basarili('/platform/sayfa-paketi/ekle', {
    projeId, paket: jetSeyahatAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true }), senaryoIndeksleri: [], ortamIdleri: [ortamId]
  });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'JetSeyahat (akış)') as Nesne;
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  ekranId = String(ekran.id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('paket: Galaksi havuzlarıyla ve girişli üretilir, doğrulamadan geçer', () => {
  const paket = jetSeyahatAkisPaketi();
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  expect(paket.gerekenAyarlar.girisGerekli).toBe(true);
  expect(JSON.stringify(paket.model)).toContain(GALAKSI_HAVUZLARI.ozel);
  expect(paket.model.girisGerekmez).toBeUndefined();
});

test('plan: boş bırakılan alanlar varsayılanla dolar, koşullar varsayılanla hesaplanır; dosyanın varsayılanı plana girmez', () => {
  const { model } = jetSeyahatAkisPaketi({ havuzlar: HAVUZLAR });
  const kimlikProfilleri = { [HAVUZLAR.ozel]: { tc1: TC1 } };
  const plan = modelKosuPlani(model, { baslik: 'x', kapsam: 'DÜNYA', alternatif: 'VİZE TÜM DÜNYA' }, { kimlikProfilleri, simdi: new Date('2026-12-30T22:30:00Z') });
  expect(plan.hatalar).toEqual([]);
  const degerler = Object.fromEntries(plan.adimlar.flatMap((a) => a.alanlar.map((x) => [x.id, x.deger])));
  expect(degerler).toMatchObject({
    baslangicTarihi: '31.12.2026', bitisTarihi: '07.01.2027', plan: '1', ulke: '15', sorguTipi: 'tekli', sigortaliSayisi: '1',
    ettirenAyniOnce: 'H', sigortaliTc: TC1.tcKimlikNo, farkliMusteri: 'ayni'
  });
  expect(degerler).not.toHaveProperty('cokluSorguDosyasi');
  // İptal bedeli yalnızca SEYAHAT PAKET'te (TEST ekranı) ve varsayılanı yok.
  expect(degerler).not.toHaveProperty('seyahatIptalBedeli');
  expect(degerler).not.toHaveProperty('musteriTipi');
});

test('tekrar analiz: düz liste bağlı listeye (kapsama göre) dönünce seçenekler "kaldırıldı" sayılmaz; gerçekten yeni olan yeni sayılır', () => {
  const yeni = jetSeyahatAkisPaketi().model as Record<string, any>;
  const eski = JSON.parse(JSON.stringify(yeni)) as Record<string, any>;
  const alanlar = eski.adimlar[0].bolumler[0].alanlar as Array<Record<string, any>>;
  const alternatif = alanlar.find((a) => a.id === 'alternatif') as Record<string, any>;
  delete alternatif.bagimlilik;
  alternatif.secenekler = ['VİZE TÜM DÜNYA', 'VİZE SCHENGEN', 'SEYAHAT PAKET'].map((d) => ({ deger: d, metin: d }));
  const ulke = alanlar.find((a) => a.id === 'ulke') as Record<string, any>;
  delete ulke.bagimlilik;
  ulke.secenekler = [{ deger: '15', metin: 'ALMANYA' }];
  const bulgular = modelFarki(eski, yeni) as unknown as Array<Record<string, any>>;
  expect(bulgular.filter((b) => b.tur === 'kaldirilanSecenek')).toEqual([]);
  const yeniUlke = bulgular.filter((b) => b.tur === 'yeniSecenek' && b.alanId === 'ulke');
  expect(yeniUlke.length).toBe(new Set([...DUNYA_ULKELERI, ...AVRUPA_ULKELERI].map((u) => u[0])).size - 1);
  expect(yeniUlke.some((b) => b.secenekKimligi === '15')).toBe(false);
  expect(bulgular.some((b) => b.tur === 'yeniSecenek' && b.alanId === 'alternatif')).toBe(false);
});

test('akış düzenleyici: sabit değerli alanlar, kimlik blokları, kalıp göstergesi, uyarılar ve bekleme süresi diyagramdan geçip aynen geri gelir', () => {
  const model = jetSeyahatAkisPaketi().model as Record<string, any>;
  expect(akisDuzenlenebilirMi(model)).toEqual({ duzenlenebilir: true, neden: null });
  const env = modeldenAkisEnvanteri(model);
  const bloklar = adimlardanBloklar(model, model.adimlar, env);
  // Kimlik blokları "kimlik:<id>", sabit alanlar gruplarında; prim: 45 sn, kalıp göstergesi ve üç uyarı.
  expect(bloklar.find((b) => b.tur === 'alanlar' && b.ad === 'Sigortalı bilgileri girilir')).toMatchObject({ alanlar: ['ettirenAyniOnce', 'kimlik:sigortaliKimlik'] });
  expect(bloklar.filter((b) => b.tur !== 'alanlar')).toEqual([
    { tur: 'aksiyon', dugme: 0, istegeBagli: false, zamanAsimiSn: 45 },
    { tur: 'mesaj', mesaj: expect.any(Number), metin: '[1-9]', desen: true },
    ...(model.adimlar.at(-1).kosu.uyarilar as Array<{ metin: string }>).map((u) => ({ tur: 'mesaj', mesaj: expect.any(Number), metin: u.metin, uyari: true })),
    { tur: 'bitir' }
  ]);
  const ayik = bloklariAyikla(bloklar);
  const c = akistanKayitEnvanteri(env, ayik.bloklar);
  expect([...ayik.hatalar, ...c.hatalar]).toEqual([]);
  const { paket } = kayitPaketiOlustur({ ekranAnahtari: 'jet-seyahat-akis', ekranAdi: 'JetSeyahat (akış)', urlYolu: '/jet-satis/jet-seyahat/', girisGerekli: true, girissiz: false, ikiAsamali: 'bilinmiyor', baglamTuru: null, mevcutModel: model }, c.envanter as NonNullable<typeof c.envanter>);
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const yeni = paket.model as Record<string, any>;
  const alanlar = (m: Record<string, any>) => Object.fromEntries((m.adimlar as Array<Record<string, any>>).flatMap((a) => (a.bolumler as Array<Record<string, any>>).flatMap((b) => (b.alanlar as Array<Record<string, any>>).map((x) => [x.id, x]))));
  const eski = alanlar(model);
  const sonra = alanlar(yeni);
  expect(Object.keys(sonra).sort()).toEqual(Object.keys(eski).sort());
  // Adım düzeyindeki koşul (sigortalı adımı yalnızca tekli sorguda) alanlarına taşınır; diğer her şey aynen.
  for (const id of ['ettirenAyniOnce', 'sigortaliKimlik']) expect(sonra[id]).toEqual({ ...eski[id], gorunurluk: { kosul: 'tekliSorgu' } });
  for (const id of Object.keys(eski).filter((x) => !['ettirenAyniOnce', 'sigortaliKimlik'].includes(x))) expect(sonra[id], id).toEqual(eski[id]);
  expect((yeni.adimlar as Array<Record<string, any>>).map((a) => a.id)).toEqual((model.adimlar as Array<Record<string, any>>).map((a) => a.id));
  expect((yeni.adimlar as Array<Record<string, any>>).map((a) => a.kosu ?? null)).toEqual((model.adimlar as Array<Record<string, any>>).map((a) => a.kosu ?? null));
  expect(Object.keys(yeni.kosullar).sort()).toEqual(Object.keys(model.kosullar).sort());
});

test('mesaj eşleşmesi: büyük harfli Latin sözcük (COVID) küçük yazılınca da eşleşir; Türkçe harfler korunur', () => {
  expect(mesajIceriyorMu('COVID teminatı olmadan yalnızca VİZE', 'covid teminati olmadan yalnızca vize')).toBe(true);
  expect(mesajIceriyorMu('İŞ KURALI: SİGORTALI', 'iş kuralı: sigortalı')).toBe(true);
  expect(mesajIceriyorMu('Ödeme alınamadı', 'odeme')).toBe(false);
});

test('tekli / aynı ettiren: hazır kimlik profili, bugün / bugün+7, varsayılan seçimler, kayak; prim hesaplanır', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Tekli / aynı / DÜNYA', { kapsam: 'DÜNYA', alternatif: 'VİZE TÜM DÜNYA', covidTeminati: 'E', kayakTeminati: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    kapsam: 'DÜNYA', alternatif: 'VİZE TÜM DÜNYA', baslangic: goreliTarih('bugun'), bitis: goreliTarih('bugun+7'), covid: 'E', kayak: true,
    iptal: null, plan: '1', ulke: '15', sorguTipi: '1', sigortaliSayisi: '1',
    sigortali: { dogum: TC1.dogumTarihi, tel: TC1.cepTelefonu, tc: TC1.tcKimlikNo, ad: 'KİŞİ 146' }, ettiren: null
  });
});

test('tekli / farklı tüzel: VKN profili, doğum tarihi yok, kimlik sorgusu (unvan gelene kadar beklenir)', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Tekli / farklı tüzel', {
    kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', covidTeminati: 'E', farkliMusteri: 'farkli', musteriTipi: 'tuzel', ettirenProfili: 'vkn1'
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', kayak: false,
    ettiren: { tip: 'T', dogum: null, tel: VKN1.cepTelefonu, no: VKN1.vergiKimlikNo, ad: 'UNVAN 890 A.Ş.' }
  });
});

test('çoklu / farklı özel: Excel yüklenir, liste dolana kadar beklenir; senaryoya özel yeni kimlik', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('Çoklu / farklı özel', {
    kapsam: 'AVRUPA', alternatif: 'VİZE SCHENGEN', covidTeminati: 'E', sorguTipi: 'coklu', cokluSorguDosyasi: 'sigortali-listesi.xlsx',
    farkliMusteri: 'farkli', musteriTipi: 'ozel', ettirenOzelKimligi: YENI_OZEL
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    sorguTipi: '2', cokluKisi: 2, sigortali: null,
    ettiren: { tip: 'O', dogum: YENI_OZEL.dogumTarihi, tel: YENI_OZEL.cepTelefonu, no: YENI_OZEL.tcKimlikNo, ad: 'KİŞİ 046' }
  });
});

test('VEYA başarı + kabul edilen uyarılar: başarı beklenirken uyarı çıkarsa hemen düşer; uyarı beklenirken seçilenlerden biri yeter', async () => {
  test.setTimeout(180_000);
  // Aynı paketten ikinci ekran: prim adımında "olmayan mesaj VEYA sıfırdan farklı prim".
  const paket = jetSeyahatAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true });
  paket.meta.ekran = { anahtar: 'jet-seyahat-veya', ad: 'JetSeyahat (veya)', urlYolu: '/jet-satis/jet-seyahat/' };
  paket.model.id = 'jet-seyahat-veya';
  const adimlar = paket.model.adimlar as Nesne[];
  (adimlar.at(-1)?.kosu as Nesne).basariGostergesi = {
    tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Hiç görünmeyen onay mesajı' }, { tur: 'desen', deger: '[1-9]', secici: '#premium-total-eur' }]
  };
  (adimlar.at(-1)?.kosu as Nesne).uyarilar = [{ metin: 'Hiç görünmeyen başka uyarı' }, { metin: 'COVID teminatı olmadan yalnızca vize', secici: '#dialog-content' }];
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = String((liste.ekranlar.find((e) => e.ad === 'JetSeyahat (veya)') as Nesne).id);
  const sonuc = await kaydetVeKos('Veya / prim', { kapsam: 'AVRUPA', alternatif: 'VİZE SCHENGEN', covidTeminati: 'E' }, ekran);
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(JSON.stringify(sonuc)).toContain('Prim hesaplanır (görülen: #premium-total-eur metni /[1-9]/ kalıbına uyar)');
  // Başarı beklenen senaryoda akışın kabul ettiği uyarı çıkar: zaman aşımını beklemeden düşer, görülen uyarı yazar.
  const basla = Date.now();
  const dusen = await kaydetVeKos('Veya / başarı beklenir, uyarı çıkar', { kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', covidTeminati: 'H' }, ekran);
  expect(dusen.durum).toBe('basarisiz');
  expect(String(dusen.hataMesaji)).toContain('COVID teminatı olmadan');
  expect(Date.now() - basla).toBeLessThan(40_000);
  // Uyarı beklenen senaryo: akıştaki iki uyarıdan biri (VEYA) görünür → başarılı; görülen uyarı raporda.
  const uyarili = await kaydetVeKos('Veya / uyarılardan biri', {
    kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', covidTeminati: 'H',
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'primHesaplama', mesaj: 'Hiç görünmeyen başka uyarı', mesajlar: ['Hiç görünmeyen başka uyarı', 'COVID teminatı olmadan yalnızca vize'] }
  }, ekran);
  expect(uyarili.durum, JSON.stringify(uyarili.hataMesaji)).toBe('basarili');
  expect((uyarili.medya as Nesne[]).map((x) => x.ad)).toContain('05 - Prim hesaplanır (görülen: uyarı "COVID teminatı olmadan yalnızca vize")');
});

test('tarayıcı uyarısı (alert): akıştaki kabul edilen uyarı beklenirse başarılı; başarı beklenirken çıkarsa hemen düşer', async () => {
  test.setTimeout(120_000);
  // Senaryoya özel sigortalı kimliğinde T.C. yok → Hesapla'da tarayıcı uyarısı (TEST ekranındaki metin).
  const tcsiz = { sigortaliKimligi: { dogumTarihi: TC1.dogumTarihi, cepTelefonu: TC1.cepTelefonu } };
  const beklenen = await kaydetVeKos('Uyarı / T.C. yok (beklenen)', {
    kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', seyahatIptalBedeli: '2', ...tcsiz,
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'primHesaplama', mesaj: KIMLIK_UYARISI }
  });
  expect(beklenen.durum, JSON.stringify(beklenen.hataMesaji)).toBe('basarili');
  const basla = Date.now();
  const dusen = await kaydetVeKos('Uyarı / T.C. yok (başarı beklenir)', { kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', ...tcsiz });
  expect(dusen.durum).toBe('basarisiz');
  expect(String(dusen.hataMesaji)).toContain(KIMLIK_UYARISI);
  expect(Date.now() - basla).toBeLessThan(40_000);
});

test('akış düzenleyici (uçtan uca): akış kopyalanıp kaydedilir, kopya akışla senaryo koşar (kimlik bloğu, sabit tarihler, kalıp göstergesi)', async () => {
  test.setTimeout(120_000);
  const tasarim = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&kopya=ana`) as Nesne & { bloklar: Nesne[] };
  expect(tasarim.basarili, String(tasarim.mesaj ?? '')).toBe(true);
  const kayit = await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId, ad: 'Kopya akış', bloklar: tasarim.bloklar, onay: true });
  const akisId = String(kayit.akisId);
  const sonuc = await (async () => {
    const baslik = 'Kopya akış / farklı tüzel';
    const yeni = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, akisId, baslik, ortamIdleri: [ortamId],
      veri: { baslik, kapsam: 'DÜNYA', alternatif: 'SEYAHAT PAKET', covidTeminati: 'E', seyahatIptalBedeli: '4', farkliMusteri: 'farkli', musteriTipi: 'tuzel', ettirenProfili: 'vkn1' }
    });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  })();
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({
    kapsam: 'DÜNYA', alternatif: 'SEYAHAT PAKET', iptal: '4', baslangic: goreliTarih('bugun'), bitis: goreliTarih('bugun+7'),
    sigortali: { tc: TC1.tcKimlikNo }, ettiren: { tip: 'T', no: VKN1.vergiKimlikNo }
  });
});

test('ortak akış (ödeme): "+ > Ortak akış" bloğuyla akışa eklenir; "Ödeme dahil" senaryoda kart profilinden ödenir, dahil değilse ödeme yok; canlıda atlanır', async () => {
  test.setTimeout(240_000);
  // Kart profili (sahte kart; yerel fikstür) ve ödeme ortak akışı.
  const kartTuru = String((await basarili('/platform/test-verisi-turu/kaydet', {
    projeId, ad: 'Kredi kartı', alanlar: ['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit'].map((ad) => ({ ad, hassas: true }))
  })).id);
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: kartTuru, ad: 'ortak', degerler: {
    isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', guvenlikKodu: '123',
    sonKullanmaAyi: JSON.stringify({ deger: '3', metin: '03' }), sonKullanmaYili: JSON.stringify({ deger: '2030', metin: '2030' }), taksit: JSON.stringify({ deger: '1', metin: 'Tek Çekim' })
  } });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: odemeAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
  // Ortak akış senaryo listesinde ekran olarak görünmez.
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  expect(liste.ekranlar.some((e) => e.ad === 'Ödeme (kredi kartı)')).toBe(false);

  // Diyagram: ana akışın kopyasına prim adımından sonra ortak akış bloğu (isteğe bağlı) eklenir.
  const tasarim = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&kopya=ana`) as Nesne & { bloklar: Nesne[]; ortakAkislar: Nesne[] };
  expect(tasarim.ortakAkislar).toEqual([{ dosya: 'odeme-kredi-karti-akis.model.json', ad: 'Ödeme (kredi kartı)', adimlar: ['Poliçeleştirilir', 'Kart formu açılır', 'Kart bilgileri girilir, ödeme tamamlanır'], yalnizTest: true }]);
  const bloklar = [...tasarim.bloklar.slice(0, -1), { tur: 'ortak', dosya: 'odeme-kredi-karti-akis.model.json', ad: 'Ödeme', istegeBagli: true }, { tur: 'bitir' }];
  const akisId = String((await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId, ad: 'Ödemeli akış', bloklar, onay: true })).akisId);
  // Diyagrama geri: blok aynen.
  const geri = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&akisId=${akisId}`) as Nesne & { bloklar: Nesne[] };
  expect(geri.bloklar.at(-2)).toEqual({ tur: 'ortak', dosya: 'odeme-kredi-karti-akis.model.json', ad: 'Ödeme', istegeBagli: true });
  // Senaryo formu: "“Ödeme” dahil" ayarı ve ortak akışın kart alanı akışın modelinde.
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}&akisId=${akisId}`) as Nesne & { model: Record<string, any> };
  const dahil = (form.model.senaryoDuzeyi.alanlar as Nesne[]).find((a) => (a.etiket as Nesne)?.form === '“Ödeme” dahil') as Nesne;
  expect(dahil).toBeTruthy();
  expect((form.model.adimlar as Nesne[]).map((a) => a.id).slice(-3)).toEqual(['odeme_policelestir', 'odeme_kartFormu', 'odeme_odeme']);

  const kos = async (baslik: string, veri: Nesne, ortam = ortamId): Promise<Nesne> => {
    const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, akisId, baslik, ortamIdleri: [ortam], veri: { baslik, kapsam: 'DÜNYA', alternatif: 'VİZE TÜM DÜNYA', covidTeminati: 'E', ...veri } });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId: ortam });
    expect(y.basarili, y.mesaj).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  };
  const odemeli = await kos('Ödemeli / DÜNYA', { [String(dahil.id)]: true });
  expect(odemeli.durum, JSON.stringify(odemeli.hataMesaji)).toBe('basarili');
  expect((odemeli.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Poliçeleştirilir', 'Kart formu açılır', 'Kart bilgileri girilir, ödeme tamamlanır']));
  expect(uygulama.odemeler).toHaveLength(1);
  expect(uygulama.odemeler[0]).toEqual({ isim: 'Deneme', soyisim: 'Kart', kartNo: '1111222233334444', cvv: '123', ay: '3', yil: '2030', taksit: '1' });
  expect(ODEME_SONUCU).toBe('Hiçbir poliçe onaylanamadı.');

  // Ödeme dahil değil: prim hesaplanınca biter, ödeme isteği yok.
  const odemesiz = await kos('Ödemesiz / DÜNYA', {});
  expect(odemesiz.durum, JSON.stringify(odemesiz.hataMesaji)).toBe('basarili');
  expect(uygulama.odemeler).toHaveLength(1);

  // Canlı işaretli ortam: ortak akışın "yalnızca test" adımları atlanır (ödeme yapılmaz).
  const canliOrtam = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Canlı (deneme)', tabanUrl: fikstur.adres, canli: true })).ortam as Nesne).id);
  const canlida = await kos('Ödemeli / canlı', { [String(dahil.id)]: true }, canliOrtam);
  expect(canlida.durum, JSON.stringify(canlida.hataMesaji)).toBe('basarili');
  expect((canlida.adimlar as Nesne[]).map((a) => a.ad)).toEqual(expect.arrayContaining(['Poliçeleştirilir (canlı ortam: atlandı)']));
  expect(uygulama.odemeler).toHaveLength(1);
});

test('Dene (model senaryosu): kaydedilmemiş taslak koşar; senaryo yazılmaz; akış seçilebilir; hata varsa açık mesaj', async () => {
  test.setTimeout(180_000);
  const say = async (): Promise<number> => ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)) as { senaryolar: Nesne[] }).senaryolar.length;
  const once = await say();
  const hesapOnce = uygulama.hesaplamalar.length;
  const d = await api('/platform/senaryo/dene', {
    projeId, ekranId, ortamId, kosuId: `kosu-${randomUUID()}`,
    veri: { kapsam: 'AVRUPA', alternatif: 'VİZE SCHENGEN', covidTeminati: 'E', farkliMusteri: 'farkli', musteriTipi: 'tuzel', ettirenProfili: 'vkn1' }
  });
  expect(d.basarili, JSON.stringify(d)).toBe(true);
  expect(d.durum, JSON.stringify(d.hataMesaji)).toBe('passed');
  expect(uygulama.hesaplamalar.length).toBe(hesapOnce + 1);
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ kapsam: 'AVRUPA', alternatif: 'VİZE SCHENGEN', ettiren: { tip: 'T', no: VKN1.vergiKimlikNo } });
  expect(await say()).toBe(once);
  // Geçersiz taslak: koşmadan doğrulama hatası.
  const hatali = await api('/platform/senaryo/dene', { projeId, ekranId, ortamId, kosuId: `kosu-${randomUUID()}`, veri: { kapsam: 'DÜNYA', alternatif: 'VİZE SCHENGEN' } });
  expect(hatali.basarili).toBe(false);
  expect(uygulama.hesaplamalar.length).toBe(hesapOnce + 1);
});

test('modeli değiştir: mevcut ekrana paket yeni sürüm olarak yazılır; senaryolar ve diğer akışlar korunur, önce etki gösterilir', async () => {
  test.setTimeout(120_000);
  const oncekiListe = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Nesne[] };
  const senaryoSayisi = oncekiListe.senaryolar.filter((s) => s.ekranId === ekranId).length;
  const oncekiAkislar = ((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[]).map((a) => a.ad);
  expect(oncekiAkislar.length).toBeGreaterThan(1);
  // Yeni paket: kayak alanının seçicisi değişmiş (tekrar analizin taşıyamadığı değişiklik).
  const paket = jetSeyahatAkisPaketi({ havuzlar: HAVUZLAR, girissiz: true }) as unknown as { model: Record<string, any> };
  const kayak = (paket.model.adimlar[0].bolumler[0].alanlar as Nesne[]).find((a) => a.id === 'kayakTeminati') as Record<string, any>;
  kayak.konum = { ...kayak.konum, secici: 'input#kayak' };
  // Yeni ekran modunda reddedilir; değiştir modunda önizleme etkiyi verir.
  expect(await api('/platform/sayfa-paketi/onizle', { projeId, paket, ekranId, mod: 'yeni' })).toMatchObject({ gecerli: false });
  const onizleme = await api('/platform/sayfa-paketi/onizle', { projeId, paket, ekranId, mod: 'degistir' }) as Nesne & { etki: { senaryolar: Nesne[]; korunanAkislar: string[] } };
  expect(onizleme.gecerli, JSON.stringify(onizleme.hatalar)).toBe(true);
  // Etki tüm ortamlardaki senaryoları listeler (liste ucu tek ortamınkileri verir).
  expect(onizleme.etki.senaryolar.length).toBeGreaterThanOrEqual(senaryoSayisi);
  expect(onizleme.etki.korunanAkislar).toEqual(oncekiAkislar.slice(1));
  // Onaysız: yalnızca etki; model değişmez.
  const onaysiz = await basarili('/platform/ekran/model/degistir', { projeId, ekranId, paket });
  expect(onaysiz.etki).toBeTruthy();
  const r = await basarili('/platform/ekran/model/degistir', { projeId, ekranId, paket, onay: true });
  expect(r.surum).toBeGreaterThan(1);
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne & { model: Record<string, any> };
  expect((form.model.adimlar[0].bolumler[0].alanlar as Nesne[]).find((a) => a.id === 'kayakTeminati')).toMatchObject({ konum: { secici: 'input#kayak' } });
  const sonraListe = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Nesne[] };
  expect(sonraListe.senaryolar.filter((s) => s.ekranId === ekranId)).toHaveLength(senaryoSayisi);
  expect(((await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ekranId}`)).akislar as Nesne[]).map((a) => a.ad)).toEqual(oncekiAkislar);
  // Değişen modelle senaryo koşar (kayak yeni seçiciyle işaretlenir).
  const baslik = 'Modeli değiştir sonrası';
  const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, kapsam: 'DÜNYA', alternatif: 'VİZE TÜM DÜNYA', covidTeminati: 'E', kayakTeminati: true } });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ kayak: true });
});

test('iş kuralı: COVID "Hayır" + vize dışı alternatif → prim hesaplamada beklenen uyarı (senaryo başarılı)', async () => {
  test.setTimeout(120_000);
  const sonuc = await kaydetVeKos('COVID yok / paket → iş kuralı', {
    kapsam: 'AVRUPA', alternatif: 'SEYAHAT PAKET', covidTeminati: 'H',
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'primHesaplama', mesaj: 'covid teminatı olmadan yalnızca vize alternatifleri' }
  });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ covid: 'H', alternatif: 'SEYAHAT PAKET' });
  expect(SEYAHAT_IS_KURALI).toContain('vize alternatifleri');
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});

test('ortak akış düzenleme: diyagramdan açılıp kaydedilir (gizli ayarlar korunur), kullanan ekranlar etki olarak gösterilir; "Ekranlara ekle" varsayılan akışa ekler', async () => {
  test.setTimeout(180_000);
  const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
  const ortakId = String((ekranlar.find((e) => e.modelTuru === 'ortakAkis') as Nesne).id);
  const model = async (id: string): Promise<Record<string, any>> => (await api(`/platform/ekran?projeId=${projeId}&id=${id}`)).model as Record<string, any>;
  const once = await model(ortakId);
  // Liste: tek akış, düzenlenebilir; kullanan ekran (Ödemeli akış).
  const liste = await api(`/platform/ekran/akislar?projeId=${projeId}&ekranId=${ortakId}`) as Nesne & { akislar: Nesne[]; kullananlar: Nesne[] };
  expect(liste).toMatchObject({ duzenlenebilir: true, ortakAkis: true });
  expect(liste.akislar).toHaveLength(1);
  expect(liste.kullananlar).toEqual([expect.objectContaining({ id: ekranId, akislar: ['Ödemeli akış'] })]);
  // Yeni akış / kopya yok; içine ortak akış eklenmez.
  expect(await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ortakId}&kopya=ana`)).toMatchObject({ basarili: false });
  const tasarim = await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ortakId}&akisId=ana`) as Nesne & { bloklar: Nesne[]; ortakAkislar: Nesne[] };
  expect(tasarim.ortakAkislar).toEqual([]);
  const ortakli = [...tasarim.bloklar.slice(0, -1), { tur: 'ortak', dosya: 'odeme-kredi-karti-akis.model.json', ad: 'Ödeme', istegeBagli: false }, { tur: 'bitir' }];
  expect(await api('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar: ortakli })).toMatchObject({ basarili: false });
  // Değiştirmeden kaydet: adımlar aynen kalır (hata penceresi, "veya" öğe göstergesi, kart profili, yalnızca test).
  const etki = await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar: tasarim.bloklar });
  expect((etki.etki as Nesne).ekranlar).toEqual([expect.objectContaining({ id: ekranId })]);
  await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar: tasarim.bloklar, onay: true });
  const sonra = await model(ortakId);
  expect(sonra.adimlar).toEqual(once.adimlar);
  expect(sonra).toMatchObject({ tur: 'ortakAkis', yalnizTestOrtami: true });
  expect(sonra.akislar).toBeUndefined();
  // Düzenle: kart formundan önceki bekleme 2 sn.
  const bloklar = tasarim.bloklar.map((b) => (b.tur === 'bekle' ? { ...b, saniye: 2 } : b));
  await basarili('/platform/ekran/akis/kaydet', { projeId, ekranId: ortakId, akisId: 'ana', ad: 'Ana akış', bloklar, onay: true });
  expect(((await model(ortakId)).adimlar[1].kosu.aksiyonlar as Nesne[])[0]).toEqual({ tur: 'bekle', sureSn: 2 });

  // Ekranlara ekle: ekranın varsayılan akışında yok → eklenebilir; önce etki, onayla eklenir; sonra "zaten var".
  const aday = await api(`/platform/ortak-akis/ekranlar?projeId=${projeId}&ekranId=${ortakId}`) as Nesne & { ekranlar: Nesne[] };
  expect(aday.ekranlar.find((x) => x.id === ekranId)).toMatchObject({ eklenebilir: true, kullananAkislar: ['Ödemeli akış'] });
  expect(await api('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [] })).toMatchObject({ basarili: false });
  const on = await basarili('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [ekranId], istegeBagli: true });
  expect(on.etki).toMatchObject({ istegeBagli: true, ekranlar: [expect.objectContaining({ id: ekranId })] });
  const surumOnce = Number((await api(`/platform/ekran?projeId=${projeId}&id=${ekranId}`)).surum);
  expect(Number((await model(ekranId)).adimlar.length)).toBeGreaterThan(0);
  const y = await basarili('/platform/ortak-akis/ekle', { projeId, ekranId: ortakId, ekranIdleri: [ekranId], istegeBagli: true, onay: true });
  expect((y.eklenen as Nesne[])[0].surum).toBe(surumOnce + 1);
  const ekranModeli = await model(ekranId);
  expect((ekranModeli.adimlar as Nesne[]).at(-1)).toMatchObject({ ortakAkis: { dosya: 'odeme-kredi-karti-akis.model.json' } });
  expect(((await api(`/platform/ortak-akis/ekranlar?projeId=${projeId}&ekranId=${ortakId}`)).ekranlar as Nesne[]).find((x) => x.id === ekranId)).toMatchObject({ eklenebilir: false });
  // Varsayılan akışta "dahil" işaretli senaryo düzenlenen ortak akışla öder.
  const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne & { model: Record<string, any> };
  const dahil = (form.model.senaryoDuzeyi.alanlar as Nesne[]).find((a) => (a.etiket as Nesne)?.form === '“Ödeme (kredi kartı)” dahil') as Nesne;
  expect(dahil).toBeTruthy();
  const odemeSayisi = uygulama.odemeler.length;
  const sonuc = await kaydetVeKos('Varsayılan akış / ödemeli', { kapsam: 'DÜNYA', alternatif: 'VİZE TÜM DÜNYA', covidTeminati: 'E', [String(dahil.id)]: true });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.odemeler).toHaveLength(odemeSayisi + 1);

  // Arayüz: ortak akışın Akışlar sekmesi (yeni akış yok; kullanan ekranlar; Ekranlara ekle… listesi; Düzenle'de ortak akış bloğu yok).
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1200 } })).newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortakId)}/akis`);
    await expect(page.getByRole('list', { name: 'Kullanan ekranlar' })).toContainText('Ana akış, Ödemeli akış');
    await expect(page.getByRole('button', { name: 'Yeni akış oluştur' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kopyala' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ekranlara ekle…' }).click();
    const diyalog = page.locator('dialog.ekran-yonetim-diyalogu');
    const satir = diyalog.getByRole('listitem').filter({ hasText: 'zaten var' });
    await expect(satir.getByRole('checkbox')).toBeDisabled();
    await expect(diyalog.getByRole('checkbox', { name: /İsteğe bağlı/ })).toBeChecked();
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    await page.getByRole('button', { name: 'Buraya blok ekle' }).first().click();
    await expect(page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Ortak akış' })).toHaveCount(0);
  } finally {
    await tarayici.close();
  }
});
