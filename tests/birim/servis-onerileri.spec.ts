// KORUMA TESTLERİ — servis senaryo önerileri (servisler/servis-onerileri.mjs + servis-oneri-baglami.mjs > servisOneriMetotlari). Saf fonksiyon:
// şema kısıtlarından (WSDL / XSD ve OpenAPI ayrı ayrı) doğru sınır ve negatif önerileri, elemeler (mevcut senaryonun kapsadığı öneri çıkmaz,
// hassas alan dışarıda kalır, alan başına en çok bir negatif), pairwise (tablo listesi dahil), beklenen sonucun "Hata beklenir" gelmesi ve
// mesajın boş olması, görülen mesaj (maskeli → engel), risk ve karar kaydı. Ağ / tarayıcı yok; değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { servisOnerileri, sinirAdaylari, type ServisOneriGirdisi, type ServisOneriSenaryosu, type ServisOnerisi } from '../../scripts/platform/servisler/servis-onerileri.mjs';
import { servisOneriMetotlari } from '../../scripts/platform/servisler/servis-oneri-baglami.mjs';
import { openapiOperasyonlari } from '../../scripts/platform/servisler/servis-sozlesmesi.mjs';
import { restSemasi } from '../../scripts/platform/servisler/rest-semasi.mjs';
import type { Servis } from '../../scripts/platform/servisler/servis-deposu.mjs';
import type { AlanDegeri } from '../../scripts/platform/servisler/servis-govdesi.mjs';
import { oneriKarariKaydet, oneriKararlariniOku } from '../../scripts/platform/ayarlar/oneri-kararlari.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { KISITLI_WSDL, OPENAPI, semalar, siparisGovdesi } from './servis-onerileri-fikstur';

const SIMDI = new Date('2026-09-28T10:00:00.000Z');

function soapServisi(ek: Record<string, unknown> = {}): Servis {
  return {
    id: 'srv1', projeId: 'p1', anahtar: 'ornek', ad: 'Örnek', tur: 'soap', durum: 'etkin', sira: null, olusturulma: '', guncellenme: '',
    ayarlar: { yol: '/Ornek/servis.asmx', operasyonlar: [{ ad: 'SiparisVer' }, { ad: 'DurumSor' }], operasyonSemalari: semalar(), ...ek }
  } as Servis;
}
const senaryo = (id: string, degerler: Record<string, string | AlanDegeri>, kontroller: Array<Record<string, any>> = [{ tur: 'soapYaniti' }], ek: Partial<ServisOneriSenaryosu> = {}): ServisOneriSenaryosu => ({
  id, baslik: `Senaryo ${id}`, icerik: { operasyon: 'SiparisVer', govde: siparisGovdesi(degerler), kontroller }, sonDurum: 'basarili', ...ek
});
const TABAN = { Tutar: '500', Kod: 'ABC', Tip: 'O', Kanal: 'A', Hediye: 'true' };
function girdi(senaryolar: ServisOneriSenaryosu[], ek: Partial<ServisOneriGirdisi> = {}, servis = soapServisi()): ServisOneriGirdisi {
  return { servis: { id: servis.id, tur: servis.tur }, metotlar: servisOneriMetotlari(servis, [], []), senaryolar, operasyon: 'SiparisVer', ustSinir: 100, simdi: SIMDI, ...ek };
}
const bul = (oneriler: ServisOnerisi[], tur: string, yol?: string) => oneriler.filter((o) => o.tur === tur && (!yol || o.alanlar.includes(yol)));

test.describe('WSDL / XSD kısıtları', () => {
  test('restriction facet\'leri, doğal aralık ve varsayılan alan şemasına yazılır', () => {
    const a = new Map(semalar().SiparisVer.alanlar.map((x) => [x.ad, x]));
    expect(a.get('Tutar')).toMatchObject({ tip: 'tamsayi', zorunlu: true, kisit: { enAz: 1, enCok: 1000 } });
    expect(a.get('Kod')).toMatchObject({ tip: 'metin', kisit: { enCokUzunluk: 5, desen: '[A-Z]+' } });
    expect(a.get('Tip')).toMatchObject({ secenekler: ['O', 'T'] });
    expect(a.get('Adet')).toMatchObject({ tip: 'tamsayi', kisit: { enAz: 1 } });
    expect(a.get('Para')).toMatchObject({ varsayilan: 'TRY' });
    expect(a.get('Aciklama')?.kisit).toBeUndefined();
  });

  test('sınır / negatif adayları: alan başına bir geçerli sınır, negatifler sınıf sırasıyla ve hepsi kuralı çiğner', () => {
    const [m] = servisOneriMetotlari(soapServisi(), [], []);
    const alan = (y: string) => m.alanlar.find((x) => x.yol === y)!;
    expect(sinirAdaylari(alan('Tutar'), '500')).toMatchObject({ pozitif: { deger: '1', etiket: 'alt sınır' }, negatifler: [{ sinif: 'sinirDisi', deger: '1001' }, { sinif: 'yanlisTip', deger: 'abc' }] });
    expect(sinirAdaylari(alan('Kod'), 'ABC')).toMatchObject({ pozitif: { deger: 'ABCAB', etiket: 'en uzun' }, negatifler: [{ sinif: 'uzunlukDisi', deger: 'ABCABC' }, { sinif: 'desenDisi', deger: '#' }] });
    expect(sinirAdaylari(alan('Tip'), 'O')).toMatchObject({ pozitif: null, negatifler: [{ sinif: 'listeDisi', deger: 'X' }] });
    expect(sinirAdaylari(alan('Aciklama'), 'x')).toEqual({ pozitif: null, negatifler: [], notlar: [] });
  });
});

test.describe('SOAP önerileri (WSDL kısıtlarından)', () => {
  test('sınır ve negatif: doğru değerler; alan başına en çok bir negatif; beklenen "Hata beklenir" (SOAP Fault) ve mesaj boş', () => {
    const r = servisOnerileri(girdi([senaryo('s1', TABAN)]));
    const tutar = bul(r.oneriler, 'negatif', 'Tutar');
    expect(tutar).toHaveLength(1);
    expect(tutar[0]).toMatchObject({ baslik: 'Negatif: Tutar = 1001 (üst sınır + 1)', beklenen: { tur: 'hata', mesaj: '', mesajEksik: true }, eklenebilir: true });
    expect(tutar[0].beklenenMetni).toBe('Hata beklenir (SOAP Fault) — mesajı siz yazın');
    expect(tutar[0].icerik.kontroller).toEqual([{ tur: 'soapHatasi' }]);
    expect(tutar[0].icerik.govde).toContain('<Tutar>1001</Tutar>');
    expect(tutar[0].icerik.govde).toContain('<Kod>ABC</Kod>');
    expect(tutar[0].gerekce).toContain('en az 1, en çok 1000');
    expect(tutar[0].gerekce).toContain('yanlış tip önerilmedi');
    expect(bul(r.oneriler, 'sinir', 'Tutar')[0]).toMatchObject({ baslik: 'Sınır: Tutar = 1 (alt sınır)', beklenen: { tur: 'basari' } });
    expect(bul(r.oneriler, 'sinir', 'Tutar')[0].icerik.kontroller).toEqual([{ tur: 'soapYaniti' }, { tur: 'soapHatasiYok' }]);
    expect(bul(r.oneriler, 'negatif', 'Kod')[0].icerik.govde).toContain('<Kod>ABCABC</Kod>');
    expect(bul(r.oneriler, 'negatif', 'Tip')[0].icerik.govde).toContain('<Tip>X</Tip>');
    expect(bul(r.oneriler, 'negatif', 'Hediye')[0].icerik.govde).toContain('<Hediye>abc</Hediye>');
    expect(bul(r.oneriler, 'negatif', 'Adet')[0].icerik.govde).toContain('<Adet>0</Adet>');
    // Kuralı olmayan alan: sınır / negatif uydurulmaz; not düşülür.
    expect(r.oneriler.some((o) => o.alanlar.includes('Aciklama'))).toBe(false);
    expect(r.notlar.map((n) => n.mesaj).join(' ')).toContain('Aciklama');
    // Negatifler her alanda tek: toplam negatif sayısı = kuralı olan (hassas olmayan) alan sayısı.
    expect(bul(r.oneriler, 'negatif').map((o) => o.alanlar[0]).sort()).toEqual(['Adet', 'Hediye', 'Kanal', 'Kod', 'Tip', 'Tutar']);
    expect(r.elenen.denklik).toBeGreaterThan(0);
  });

  test('zorunlu alan eksik: gönderilmeyen zorunlu alan önerilir, beklenen hata; isteğe bağlı alan önerilmez', () => {
    const r = servisOnerileri(girdi([senaryo('s1', TABAN)]));
    expect(bul(r.oneriler, 'zorunlu').map((o) => o.alanlar[0]).sort()).toEqual(['Kod', 'Tip', 'Tutar']);
    const z = bul(r.oneriler, 'zorunlu', 'Kod')[0];
    expect(z.icerik.govde).not.toContain('<Kod>');
    expect(z.beklenen).toEqual({ tur: 'hata', mesaj: '', mesajEksik: true });
  });

  test('elemeler: mevcut senaryonun denediği sınır / negatif / zorunlu eksik önerilmez; hassas alan (gizli ad) dışarıda kalır', () => {
    const r = servisOnerileri(girdi([
      senaryo('s1', TABAN),
      senaryo('s2', { ...TABAN, Tutar: '1' }),
      senaryo('s3', { ...TABAN, Tutar: '-5' }, [{ tur: 'soapHatasi' }]),
      senaryo('s4', { Tutar: '500', Tip: 'O' }, [{ tur: 'soapHatasi' }])
    ]));
    expect(bul(r.oneriler, 'sinir', 'Tutar')).toHaveLength(0);
    expect(bul(r.oneriler, 'negatif', 'Tutar')).toHaveLength(0);
    expect(bul(r.oneriler, 'zorunlu', 'Kod')).toHaveLength(0);
    expect(r.elenen.kapsanan).toBeGreaterThanOrEqual(3);
    // Parola: gizli adlı (kısıtlı olsa da) — sınır / negatif / değer yok; not var.
    expect(r.oneriler.some((o) => o.alanlar.includes('Parola') || JSON.stringify(o.icerik).includes('<Parola>'))).toBe(false);
    expect(r.notlar.some((n) => n.tur === 'hassas' && n.mesaj.includes('Parola'))).toBe(true);
    // Ek gizli ad (Ayarlar > Maskeleme) da hassas sayılır.
    const g = girdi([senaryo('s1', TABAN)]);
    g.metotlar = servisOneriMetotlari(soapServisi(), [], ['Kod']);
    const r2 = servisOnerileri(g);
    expect(r2.oneriler.some((o) => o.alanlar.includes('Kod') && o.tur !== 'zorunlu')).toBe(false);
  });

  test('pairwise: liste alanlarının eksik ikilileri kapanır; mevcut senaryoların ikilileri kapsanmış sayılır; denenmemiş değer satıra katılır', () => {
    const r = servisOnerileri(girdi([senaryo('s1', TABAN), senaryo('s2', { ...TABAN, Tip: 'T', Kanal: 'B', Hediye: 'false' })]));
    expect(r.kombinasyon.secili).toEqual(['Tip', 'Kanal', 'Hediye']);
    // Evren: Tip×Kanal 6 + Tip×Hediye 4 + Kanal×Hediye 6 = 16; iki senaryo 6 ikiliyi kapsar.
    expect(r.kombinasyon).toMatchObject({ evren: 16, kapsanan: 6, eksik: 10, gecersiz: 0, kalan: 0 });
    const satirlar = bul(r.oneriler, 'kombinasyon');
    expect(satirlar.length).toBe(r.kombinasyon.satir);
    const kapanan = new Set(satirlar.flatMap((o) => o.ikililer ?? []));
    expect(kapanan.size).toBe(10);
    // Kanal = C hiç denenmedi: ayrı "deger" önerisi değil, bir kombinasyon satırında (gerekçede) yer alır.
    expect(bul(r.oneriler, 'deger')).toHaveLength(0);
    expect(satirlar.some((o) => (o.degerler ?? []).includes('Kanal = C') && o.gerekce.startsWith('“Kanal = C”'))).toBe(true);
    expect(satirlar.every((o) => o.beklenen.tur === 'basari')).toBe(true);
    expect(r.kapsam.degerler).toMatchObject({ toplam: 7, kapsanan: 6, eksikler: ['Kanal = C'] });
  });

  test('pairwise tablo listesi: tabloya bağlı alan satır seçimiyle; aynı satırda olmayan ikililer kurulmaz; veri güdümlü satırlar kapsanmış sayılır', () => {
    const tablo = { id: 'tb1', ad: 'Kanallar', sutunlar: [{ ad: 'Kanal' }, { ad: 'Bolge' }], satirlar: [
      { degerler: { Kanal: 'A', Bolge: 'K1' } }, { degerler: { Kanal: 'B', Bolge: 'K1' } }, { degerler: { Kanal: 'C', Bolge: 'K2' } }] };
    const servis = soapServisi({ alanBaglari: { SiparisVer: { Kanal: { tablo: 'tb1', sutun: 'Kanal' } } } });
    const g = girdi([senaryo('s1', { ...TABAN, Kanal: { kaynak: 'tablo' as const, deger: 'Kanallar.Kanal' } }, [{ tur: 'soapYaniti' }], { degerSatirlari: [{ Kanal: 'A' }, { Kanal: 'B' }] })],
      { tablolar: [tablo], kombinasyonAlanlari: ['Tip', 'Kanal'] }, servis);
    g.metotlar = servisOneriMetotlari(servis, [tablo], []);
    const r = servisOnerileri(g);
    expect(r.kombinasyon).toMatchObject({ secili: ['Tip', 'Kanal'], evren: 6, kapsanan: 2 });
    const satir = bul(r.oneriler, 'kombinasyon').find((o) => o.degisiklikler.some((d) => d.etiket === 'Kanal' && d.deger === 'C'));
    expect(satir).toBeTruthy();
    expect(satir!.icerik.govde).toContain('<Kanal>${Kanallar.Kanal}</Kanal>');
    expect(satir!.icerik.tabloSecimleri).toEqual({ 'tb1|': { Kanal: 'C' } });
  });

  test('senaryosu olmayan metot: başarılı akış; değerler şemadan (varsayılan / liste); değeri olmayan zorunlu alan "eksik" (doğrudan eklenmez)', () => {
    const r = servisOnerileri(girdi([senaryo('s1', TABAN)], { operasyon: null }));
    const b = bul(r.oneriler, 'basari');
    expect(b.map((o) => o.operasyon)).toEqual(['DurumSor']);
    expect(b[0]).toMatchObject({ baslik: 'Başarılı akış: DurumSor', eksikler: ['SiparisNo'], eklenebilir: false, beklenen: { tur: 'basari' } });
    expect(r.kapsam.metotlar).toMatchObject({ kapsanan: 1, toplam: 2, eksikler: ['DurumSor'] });
    // Tabloya bağlı zorunlu alan: tablo başvurusu (değer koşuda seçilen satırdan); eksik kalmaz.
    const tablo = { id: 'tb2', ad: 'Siparisler', sutunlar: [{ ad: 'No' }], satirlar: [{ degerler: { No: '42' } }] };
    const servis = soapServisi({ alanBaglari: { DurumSor: { SiparisNo: { tablo: 'tb2', sutun: 'No' } } } });
    const r2 = servisOnerileri({ ...girdi([], { operasyon: 'DurumSor', tablolar: [tablo] }, servis), metotlar: servisOneriMetotlari(servis, [tablo], []) });
    expect(bul(r2.oneriler, 'basari')[0]).toMatchObject({ eksikler: [], eklenebilir: true });
    expect(bul(r2.oneriler, 'basari')[0].icerik.govde).toContain('<SiparisNo>${Siparisler.No}</SiparisNo>');
  });

  test('risk: son dönemde başarısız senaryonun değeri içeren kombinasyon öne alınır; görülen mesaj (beklenen olarak test edilmemiş) önerilir', () => {
    const s2 = senaryo('s2', { ...TABAN, Tip: 'T', Kanal: 'B', Hediye: 'false' });
    const r = servisOnerileri(girdi([senaryo('s1', TABAN), s2, senaryo('s3', TABAN, [{ tur: 'soapHatasi' }, { tur: 'icerir', deger: 'Stok yok' }])], {
      gecmis: { hataGunu: 14, uyariGunu: 90, hatalar: [{ senaryoId: 's2', sayi: 3 }], mesajlar: [
        { metin: 'Tutar limiti aşıldı', operasyon: 'SiparisVer', sayi: 4, senaryoIdleri: ['s2'], hataTuru: 'fault' },
        { metin: 'Stok yok.', operasyon: 'SiparisVer', sayi: 2, senaryoIdleri: ['s1'], hataTuru: 'fault' },
        { metin: 'Müşteri *** bulunamadı', operasyon: 'SiparisVer', sayi: 1, senaryoIdleri: ['s1'], hataTuru: 'yanit' },
        { metin: 'Başka metot', operasyon: 'DurumSor', sayi: 9, senaryoIdleri: [], hataTuru: 'fault' }] }
    }));
    const riskli = bul(r.oneriler, 'kombinasyon').filter((o) => o.neden === 'risk');
    expect(riskli.length).toBeGreaterThan(0);
    expect(riskli[0].gerekce).toMatch(/son 14 günde 3 başarısız koşuda yer aldı/);
    const uyarilar = bul(r.oneriler, 'uyari');
    expect(uyarilar.map((o) => o.baslik)).toEqual(['Hata beklenir: Tutar limiti aşıldı', 'Hata beklenir: Müşteri *** bulunamadı']);
    expect(uyarilar[0]).toMatchObject({ neden: 'risk', beklenen: { tur: 'hata', mesaj: 'Tutar limiti aşıldı', mesajEksik: false }, engel: null, eklenebilir: true });
    expect(uyarilar[0].icerik.kontroller).toEqual([{ tur: 'soapHatasi' }, { tur: 'icerir', deger: 'Tutar limiti aşıldı' }]);
    // Mesajı üreten senaryonun değerleriyle kurulur.
    expect(uyarilar[0].icerik.govde).toBe(s2.icerik.govde);
    // Maskeli parça: doğrudan eklenemez (önizlemede düzeltilir); iş kuralı mesajı (Fault yok) yalnız mesajla beklenir.
    expect(uyarilar[1]).toMatchObject({ eklenebilir: false, engel: expect.stringContaining('maskelenmiş') });
    expect(uyarilar[1].icerik.kontroller).toEqual([{ tur: 'soapYaniti' }, { tur: 'icerir', deger: 'Müşteri *** bulunamadı' }]);
    expect(r.kapsam.mesajlar).toMatchObject({ kapsanan: 1, toplam: 3 });
    // Risk nedenli öneriler en üstte.
    expect(r.oneriler[0].neden).toBe('risk');
  });

  test('kararlar: reddedilen öneri gizlenir ("sonra" bir hafta), kabul / redler aynı servis + metotta alan ağırlığını değiştirir', () => {
    const s = [senaryo('s1', TABAN)];
    const ilk = servisOnerileri(girdi(s));
    const hedef = bul(ilk.oneriler, 'negatif', 'Tutar')[0];
    const red = { zaman: '2026-09-27T10:00:00.000Z', servisId: 'srv1', metot: 'SiparisVer', kimlik: hedef.kimlik, tur: 'negatif', alanlar: ['Tutar'], karar: 'red' as const };
    const r = servisOnerileri(girdi(s, { kararlar: [red] }));
    expect(r.oneriler.some((o) => o.kimlik === hedef.kimlik)).toBe(false);
    expect(r.elenen.reddedilen).toBe(1);
    const sonra = servisOnerileri(girdi(s, { kararlar: [{ ...red, redNedeni: 'sonra' }] }));
    expect(sonra.elenen.ertelenen).toBe(1);
    const gosterilen = servisOnerileri(girdi(s, { kararlar: [red], reddedilenleriGoster: true }));
    expect(gosterilen.oneriler.find((o) => o.kimlik === hedef.kimlik)?.reddedildi).toBe(true);
    // Başka servisin kararı bu servisi etkilemez.
    expect(servisOnerileri(girdi(s, { kararlar: [{ ...red, servisId: 'baska' }] })).oneriler.some((o) => o.kimlik === hedef.kimlik)).toBe(true);
    // Kodun sınır önerisi: Kod alanı iki kez reddedilince puanı düşer.
    const kodSinir = bul(ilk.oneriler, 'sinir', 'Kod')[0];
    const redler = [1, 2].map((i) => ({ ...red, kimlik: `x${i}`, tur: 'sinir', alanlar: ['Kod'] }));
    expect(bul(servisOnerileri(girdi(s, { kararlar: redler })).oneriler, 'sinir', 'Kod')[0].puan).toBeLessThan(kodSinir.puan);
  });

  test('öneri istek atmaz ve hiçbir şeyi değiştirmez: aynı girdide aynı çıktı (deterministik)', () => {
    const g = girdi([senaryo('s1', TABAN)]);
    const once = JSON.stringify(g);
    expect(JSON.stringify(servisOnerileri(g))).toBe(JSON.stringify(servisOnerileri(g)));
    expect(JSON.stringify(g)).toBe(once);
  });
});

test.describe('REST önerileri (OpenAPI kısıtlarından)', () => {
  const op = { ad: 'kayitGuncelle', metot: 'POST', yol: '/kayitlar/{id}', sorgu: [{ ad: 'sayfa', deger: '1' }], icerikTuru: 'application/json',
    govdeOrnegi: '{"ad":"Ali","tur":"bireysel"}', basliklar: [], yalnizTest: false, gizliAlanlar: [] };
  const istek = () => openapiOperasyonlari(OPENAPI).operasyonlar[0].istek!;
  const restServisi = (sozlesmeli = true): Servis => ({
    id: 'srv2', projeId: 'p1', anahtar: 'kayit', ad: 'Kayıt', tur: 'rest', durum: 'etkin', sira: null, olusturulma: '', guncellenme: '',
    ayarlar: { yol: '/', operasyonlar: [op], ...(sozlesmeli ? { sozlesmeler: { kayitGuncelle: { kaynak: 'openapi', bicim: 'json', sema: {}, istek: istek(), guncellenme: '' } } } : {}) }
  } as unknown as Servis);
  const restSenaryosu: ServisOneriSenaryosu = { id: 'r1', baslik: 'Kayıt güncelle', sonDurum: 'basarili', icerik: {
    operasyon: 'kayitGuncelle', govde: '{\n  "ad": "Ali",\n  "tur": "bireysel",\n  "tutar": ${Tutarlar.Tutar}\n}', http: { metot: 'POST', yol: '/kayitlar/7?sayfa=1', icerikTuru: 'application/json' },
    kontroller: [{ tur: 'durumKodu', deger: '200-299' }] } };

  test('OpenAPI istek alanları: yol / sorgu / gövde kısıtları okunur ($ref çözülür)', () => {
    const alanlar = new Map(restSemasi({ ad: 'x', yol: '' }).alanlar.map((a) => [a.ad, a]));
    expect(alanlar.size).toBe(0);
    const i = istek();
    expect(i.map((g) => g.ad)).toEqual(['yol', 'sorgu', 'govde']);
    const govde = new Map(i[2].cocuklar!.map((a) => [a.ad, a]));
    expect(i[0].cocuklar![0]).toMatchObject({ ad: 'id', tip: 'tamsayi', zorunlu: true, kisit: { enAz: 1 } });
    expect(i[1].cocuklar!.map((a) => a.ad)).toEqual(['sayfa', 'dil']);
    expect(i[1].cocuklar![0]).toMatchObject({ kisit: { enAz: 1, enCok: 100 } });
    expect(govde.get('ad')).toMatchObject({ zorunlu: true, kisit: { enAzUzunluk: 2, enCokUzunluk: 3 } });
    expect(govde.get('eposta')).toMatchObject({ kisit: { bicim: 'email' } });
    expect(govde.get('tutar')).toMatchObject({ tip: 'ondalik', kisit: { enAz: 0, altHaric: true } });
  });

  test('sınır / negatif REST isteğine doğru yere yazılır (yol parçası, sorgu, tipli JSON); beklenen HTTP 4xx / 5xx, mesaj boş', () => {
    const s = restServisi();
    const r = servisOnerileri({ servis: { id: s.id, tur: 'rest' }, metotlar: servisOneriMetotlari(s, [], []), senaryolar: [restSenaryosu], operasyon: 'kayitGuncelle', ustSinir: 100, simdi: SIMDI });
    const n = (yol: string) => bul(r.oneriler, 'negatif', yol)[0];
    expect(n('yol/id').icerik.http?.yol).toBe('/kayitlar/0?sayfa=1');
    expect(n('sorgu/sayfa').icerik.http?.yol).toBe('/kayitlar/7?sayfa=101');
    expect(n('govde/ad').icerik.govde).toContain('"ad": "AliA"');
    expect(n('govde/tur').icerik.govde).toContain('"tur": "X"');
    expect(n('govde/eposta').icerik.govde).toContain('"eposta": "abc"');
    expect(n('govde/ad').icerik.kontroller).toEqual([{ tur: 'durumKodu', deger: '400-599' }]);
    expect(n('govde/ad').beklenen).toEqual({ tur: 'hata', mesaj: '', mesajEksik: true });
    expect(n('govde/ad').beklenenMetni).toBe('Hata beklenir (HTTP 4xx / 5xx) — mesajı siz yazın');
    // Tırnaksız ${…} (sayı alanında tablo başvurusu) korunur.
    expect(n('govde/ad').icerik.govde).toContain('"tutar": ${Tutarlar.Tutar}');
    const sinir = bul(r.oneriler, 'sinir', 'sorgu/sayfa')[0];
    // sayfa = 1 (alt sınır) ve ad = "Ali" (en uzun, 3 karakter) mevcut senaryoda zaten var: önerilmez.
    expect(sinir).toBeUndefined();
    expect(bul(r.oneriler, 'sinir', 'govde/ad')).toHaveLength(0);
    // "Hariç" alt sınır (> 0): geçerli sınır 0.01, sayı olarak yazılır; sınır dışı 0.
    expect(bul(r.oneriler, 'sinir', 'govde/tutar')[0].icerik.govde).toContain('"tutar": 0.01');
    expect(n('govde/tutar').icerik.govde).toContain('"tutar": 0');
    // Hassas (gizli adlı) gövde alanı: öneri yok.
    expect(r.oneriler.some((o) => o.alanlar.includes('govde/token'))).toBe(false);
    // Zorunlu gövde alanı eksik.
    expect(bul(r.oneriler, 'zorunlu', 'govde/ad')[0].icerik.govde).not.toContain('"ad"');
  });

  test('şema bilgisi yoksa (yalnız örnek gövde) sınır / negatif / yanlış tip uydurulmaz', () => {
    const s = restServisi(false);
    const r = servisOnerileri({ servis: { id: s.id, tur: 'rest' }, metotlar: servisOneriMetotlari(s, [], []), senaryolar: [restSenaryosu], operasyon: 'kayitGuncelle', ustSinir: 100, simdi: SIMDI });
    expect(bul(r.oneriler, 'negatif')).toHaveLength(0);
    expect(bul(r.oneriler, 'sinir')).toHaveLength(0);
    expect(r.notlar.some((x) => x.mesaj.includes('kuralı olmayan'))).toBe(true);
  });
});

test.describe('karar kaydı (kasada, servis + metot kimliğiyle)', () => {
  test('servis kararı yazılır ve ekran kararlarından ayrı okunur; geçersiz servis kararı reddedilir', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'servis-oneri-karar-'));
    const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
    try {
      await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
      const projeId = projeKaydet(vt, { ad: 'Karar Projesi' });
      const servisId = randomUUID();
      const k = oneriKarariKaydet(vt, projeId, { servisId, metot: 'SiparisVer', kimlik: 'SiparisVer|negatif:Tutar:sinirDisi', tur: 'negatif', neden: 'sinir', alanlar: ['Tutar'], karar: 'red', redNedeni: 'gereksiz' }, SIMDI);
      expect(k).toMatchObject({ servisId, metot: 'SiparisVer', tur: 'negatif', karar: 'red', redNedeni: 'gereksiz' });
      expect(k.ekranId).toBeUndefined();
      oneriKarariKaydet(vt, projeId, { ekranId: randomUUID(), kimlik: 'zorunlu:ad', tur: 'zorunlu', karar: 'kabul' }, SIMDI);
      expect(oneriKararlariniOku(vt, projeId, 'servis').map((x) => x.kimlik)).toEqual(['SiparisVer|negatif:Tutar:sinirDisi']);
      expect(oneriKararlariniOku(vt, projeId, 'ekran').map((x) => x.kimlik)).toEqual(['zorunlu:ad']);
      expect(oneriKararlariniOku(vt, projeId)).toHaveLength(2);
      expect(() => oneriKarariKaydet(vt, projeId, { servisId, kimlik: 'x', tur: 'negatif', karar: 'red' })).toThrow('"metot" geçersiz.');
      expect(() => oneriKarariKaydet(vt, projeId, { servisId, metot: 'M', kimlik: 'x', tur: 'bilinmez', karar: 'red' })).toThrow('"tur" geçersiz.');
    } finally {
      vt.kapat();
      rmSync(klasor, { recursive: true, force: true });
    }
  });
});

test('fikstür WSDL\'i yalnız sentetik ad alanı içerir', () => {
  expect(KISITLI_WSDL).not.toMatch(/https?:\/\/(?!schemas\.xmlsoap\.org|www\.w3\.org)/);
});
