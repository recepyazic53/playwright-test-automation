// GÖRELİ TARİH — tarih alanında "bugün", "bugün+7", "bugün-3", "ay başı", "ay sonu+2" (Türkçe / ASCII, boşluk toleranslı):
//  · saf: ayrıştırma, kanonik yazım, biçimler, Europe/Istanbul gün dönümü, ay sonu, sınırlar, eskiyen tarih + "bugüne göre" önerisi,
//    doğrulayıcı (kopya dilbilgisi aynı sonucu verir; anlaşılmayan yazıma anlaşılır hata), koşu planı (senaryo değeri, tablo hücresi,
//    sabit değer), Playwright dışa aktarma (tarih koşu anında hesaplanır), paket doğrulayıcı uyarısı;
//  · koşucu: 127.0.0.1'deki sahte sayfaya "bugün+7" ve tablodan gelen "bugün" doğru tarihle yazılır, raporda ifade → tarih görünür;
//  · arayüz: senaryo formu (Bugüne göre, önizleme, sınır uyarısı, eskiyen tarihte "Bugüne göre yap"), senaryolar listesi rozeti ve
//    toplu dönüşüm (önizleme → onay), 390 px taşma yok. Saat sabitlenir (enjekte "şimdi" / page.clock). Dış istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import {
  bugunuGoreliOner, eskiyenTarih, eskiyenTarihAlanlari, goreliGun, goreliHataMesaji, goreliIfadeAyristir, goreliIfadeHataliMi, goreliIfadeKanonik,
  goreliOzet, goreliTarihCoz, istanbulGunu, kayittanGoreliIfade, sabitTarihAyristir, tarihBicimle, tarihSinirDenetimi
} from '../../scripts/platform/senaryolar/goreli-tarih.mjs';
import { goreliTarihGecerliMi, goreliTarihHataliMi, MESAJLAR, senaryoyuDogrula } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { playwrightKoduUret } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { ekranBasvurulariniCoz } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { formSemasiOlustur, tumFormAlanlari } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';
import { EKRAN_ADI, TELEFON, siparisModeli, siparisPaketi } from './senaryo-onerileri-fikstur';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
/** Sabit "şimdi": 28.09.2026 09:00 İstanbul. */
const SIMDI = new Date('2026-09-28T09:00:00+03:00');

test.describe('saf: ifadeler ve tarih hesabı', () => {
  test('yazım toleransı, kanonik yazım, geçersiz yazım', () => {
    for (const [m, beklenen] of [
      ['bugün', 'bugün'], ['bugun', 'bugün'], ['Bugün', 'bugün'], ['BUGÜN', 'bugün'], ['bugün+7', 'bugün+7'], [' bugun + 7 ', 'bugün+7'],
      ['bugün-3', 'bugün-3'], ['bugün+0', 'bugün'], ['bugün+7 gün', 'bugün+7'], ['bugun+7g', 'bugün+7'], ['ay sonu', 'ay sonu'], ['aysonu+2', 'ay sonu+2'],
      ['Ay Başı', 'ay başı'], ['ay basi-1', 'ay başı-1'], ['ay_sonu', 'ay sonu']
    ] as const) expect(goreliIfadeKanonik(m), m).toBe(beklenen);
    for (const m of ['yarın', '05.10.2026', '', 'bugün+x', 'bugün 7', 'bugün++1', 'bugün+999999', 'ay ortası']) expect(goreliIfadeAyristir(m), m).toBeNull();
    expect(goreliIfadeHataliMi('bugün+x')).toBe(true);
    expect(goreliIfadeHataliMi('bugün 7')).toBe(true);
    expect(goreliIfadeHataliMi('05.10.2026')).toBe(false);
    expect(goreliIfadeHataliMi('bugün+7')).toBe(false);
    expect(goreliHataMesaji('bugün+x')).toContain("'bugün+x' anlaşılamadı; örnek: bugün+7");
    expect(goreliIfadeAyristir('bugün-3')).toEqual({ taban: 'bugun', gun: -3 });
  });

  test('çözüm: biçimler, ay sonu / başı, artık yıl, İstanbul gün dönümü', () => {
    expect(goreliTarihCoz('bugün+7', 'gg.aa.yyyy', SIMDI)).toBe('05.10.2026');
    expect(goreliTarihCoz('bugun-3', 'yyyy-aa-gg', SIMDI)).toBe('2026-09-25');
    expect(goreliTarihCoz('bugün', 'YYYY-AA-GG', SIMDI)).toBe('2026-09-28');
    expect(goreliTarihCoz('bugün', 'dd/MM/yyyy', SIMDI)).toBe('28/09/2026');
    expect(goreliTarihCoz('bugün+100', null, SIMDI)).toBe('06.01.2027');
    expect(goreliTarihCoz('ay sonu', 'gg.aa.yyyy', SIMDI)).toBe('30.09.2026');
    expect(goreliTarihCoz('ay sonu+1', 'gg.aa.yyyy', SIMDI)).toBe('01.10.2026');
    expect(goreliTarihCoz('ay başı-1', 'gg.aa.yyyy', SIMDI)).toBe('31.08.2026');
    expect(goreliTarihCoz('ay sonu', 'gg.aa.yyyy', new Date('2028-02-10T12:00:00+03:00'))).toBe('29.02.2028');
    expect(goreliTarihCoz('ay sonu', 'gg.aa.yyyy', new Date('2027-02-10T12:00:00+03:00'))).toBe('28.02.2027');
    // UTC 21:30 = İstanbul 00:30 (ertesi gün): gün İstanbul'a göre.
    expect(istanbulGunu(new Date('2026-09-27T21:30:00Z'))).toEqual({ yil: 2026, ay: 9, gun: 28 });
    expect(goreliTarihCoz('bugün', 'gg.aa.yyyy', new Date('2026-09-27T20:59:59Z'))).toBe('27.09.2026');
    expect(goreliTarihCoz('bugün', 'gg.aa.yyyy', new Date('2026-09-27T21:00:00Z'))).toBe('28.09.2026');
    expect(goreliTarihCoz('05.10.2026', 'gg.aa.yyyy', SIMDI)).toBeNull();
    expect(goreliOzet('bugun+7', 'gg.aa.yyyy', SIMDI)).toBe('bugün+7 → 05.10.2026');
    expect(sabitTarihAyristir('2026-10-05', 'YYYY-AA-GG')).toEqual({ yil: 2026, ay: 10, gun: 5 });
    expect(sabitTarihAyristir('31.02.2026', 'gg.aa.yyyy')).toBeNull();
    expect(tarihBicimle({ yil: 2026, ay: 1, gun: 2 }, 'gg.aa.yy')).toBe('02.01.26');
  });

  test('sınırlar, eskiyen tarih ve "bugüne göre" önerisi', () => {
    const sinirlar = { enAz: 'bugun+1', enCok: 'bugun+30' };
    const g = (i: string) => goreliGun(i, SIMDI)!;
    expect(tarihSinirDenetimi(g('bugün+7'), sinirlar, 'gg.aa.yyyy', SIMDI)).toBeNull();
    expect(tarihSinirDenetimi(g('bugün'), sinirlar, 'gg.aa.yyyy', SIMDI)).toMatchObject({ tur: 'erken', sinir: 'bugün+1', sinirTarihi: '29.09.2026' });
    expect(tarihSinirDenetimi(g('bugün+31'), sinirlar, 'gg.aa.yyyy', SIMDI)?.mesaj).toContain('En geç bugün+30 (28.10.2026)');
    expect(tarihSinirDenetimi(g('bugün'), { enAz: '01.10.2026' }, 'gg.aa.yyyy', SIMDI)?.mesaj).toContain('En erken 01.10.2026');
    // Kaydedildiğinde ilerideydi, şimdi geçmişte: eskidi; farkı korunur (kayıt 20.09, tarih 25.09 → bugün+5).
    expect(eskiyenTarih('25.09.2026', 'gg.aa.yyyy', null, SIMDI, '2026-09-20T10:00:00.000Z')).toMatchObject({ neden: 'gecmis' });
    expect(bugunuGoreliOner('25.09.2026', 'gg.aa.yyyy', '2026-09-20T10:00:00.000Z', null, SIMDI)).toBe('bugün+5');
    // Kaydedilirken de geçmişteydi (ör. doğum tarihi): eskimiş sayılmaz. Kayıt anı yoksa her geçmiş tarih eskidir; öneri "bugün".
    expect(eskiyenTarih('01.02.1990', 'gg.aa.yyyy', null, SIMDI, '2026-09-20T10:00:00.000Z')).toBeNull();
    expect(eskiyenTarih('01.02.1990', 'gg.aa.yyyy', null, SIMDI)).toMatchObject({ neden: 'gecmis' });
    expect(bugunuGoreliOner('01.02.1990', 'gg.aa.yyyy', null, null, SIMDI)).toBe('bugün');
    // Sınır dışı (gelecekte ama en geçten sonra) → sınıra çekilir; göreli ve tablo değeri eskimez.
    expect(eskiyenTarih('01.01.2099', 'gg.aa.yyyy', sinirlar, SIMDI)).toMatchObject({ neden: 'sinir' });
    expect(bugunuGoreliOner('01.01.2099', 'gg.aa.yyyy', SIMDI, sinirlar, SIMDI)).toBe('bugün+30');
    expect(bugunuGoreliOner('01.01.2020', 'gg.aa.yyyy', SIMDI, sinirlar, SIMDI)).toBe('bugün+1');
    expect(eskiyenTarih('bugün+3', 'gg.aa.yyyy', sinirlar, SIMDI)).toBeNull();
    expect(eskiyenTarih('01.10.2026', 'gg.aa.yyyy', sinirlar, SIMDI)).toBeNull();
    // Kayıttan: kayıt günü "bugün", sonrası "bugün+N".
    expect(kayittanGoreliIfade('2026-09-28', 'YYYY-AA-GG', SIMDI)).toBe('bugün');
    expect(kayittanGoreliIfade('03.10.2026', 'gg.aa.yyyy', SIMDI)).toBe('bugün+5');
    // Form alanlarından eskiyenler (sipariş fikstürü: teslimat tarihi bugün+1 … bugün+30).
    const alanlar = tumFormAlanlari(formSemasiOlustur(siparisModeli()));
    expect(eskiyenTarihAlanlari(alanlar, { teslimatTarihi: '01.01.2099' }, SIMDI).map((e) => e.anahtar)).toEqual(['teslimatTarihi']);
    expect(eskiyenTarihAlanlari(alanlar, { teslimatTarihi: 'bugün+2' }, SIMDI)).toEqual([]);
    expect(eskiyenTarihAlanlari(alanlar, { teslimatTarihi: '${Tablo.Tarih}' }, SIMDI)).toEqual([]);
  });

  test('doğrulayıcı: göreli ifade geçerli, anlaşılmayan yazım anlaşılır hata; kopya dilbilgisi ortak modülle aynı', () => {
    for (const m of ['bugün', 'bugun+7', ' Bugün - 3 ', 'ay sonu', 'aybasi+1', 'bugün+7 gün', 'bugün+x', 'bugün 7', 'yarın', '05.10.2026', 'bugün+999999', 'BUGÜN']) {
      expect(goreliTarihGecerliMi(m), m).toBe(goreliIfadeAyristir(m) !== null);
      expect(goreliTarihHataliMi(m), m).toBe(goreliIfadeHataliMi(m));
    }
    const model = siparisModeli() as Parameters<typeof senaryoyuDogrula>[1]["model"];
    const taban = { baslik: 'x', urunAdi: 'Roman', adet: 2, kategori: 'kitap', renk: 'standart', telefon: TELEFON };
    const iyi = senaryoyuDogrula({ ...taban, teslimatTarihi: 'bugün+7' }, { model, kaynak: 'kayit' });
    expect(iyi.hatalar).toEqual([]);
    const kotu = senaryoyuDogrula({ ...taban, teslimatTarihi: 'bugün+x' }, { model, kaynak: 'kayit' });
    expect(kotu.hatalar).toEqual([{ alan: 'teslimatTarihi', mesaj: MESAJLAR.goreliTarihAnlasilamadi('Teslimat tarihi', 'bugün+x') }]);
    expect(kotu.hatalar[0].mesaj).toContain("'bugün+x' anlaşılamadı; örnek: bugün+7");
  });

  test('koşu planı: senaryo değeri ve tablo hücresi göreli ifade → tarih; Playwright dışa aktarma tarihi koşu anında hesaplar', () => {
    const model = siparisModeli();
    const veri = { baslik: 'x', urunAdi: 'Roman', adet: 2, kategori: 'kitap', renk: 'standart', teslimatTarihi: 'bugün+7', telefon: TELEFON };
    const plan = modelKosuPlani(model, veri, { simdi: SIMDI });
    const alan = plan.adimlar.flatMap((a) => a.alanlar).find((a) => a.id === 'teslimatTarihi');
    expect(alan).toMatchObject({ deger: '05.10.2026', goreliIfade: 'bugün+7', tarihBicimi: 'gg.aa.yyyy' });
    // Sabit tarih aynen; metin alanındaki "bugün" metin kalır.
    const sabit = modelKosuPlani(model, { ...veri, teslimatTarihi: '06.10.2026', siparisNotu: 'bugün' }, { simdi: SIMDI }).adimlar.flatMap((a) => a.alanlar);
    expect(sabit.find((a) => a.id === 'teslimatTarihi')).toMatchObject({ deger: '06.10.2026' });
    expect(sabit.find((a) => a.id === 'teslimatTarihi')?.goreliIfade).toBeUndefined();
    expect(sabit.find((a) => a.id === 'siparisNotu')?.deger).toBe('bugün');
    // Tablo hücresi "bugün": başvuru çözümü değeri aynen verir, plan tarihe çevirir.
    const tablo = { id: 't1', ad: 'Tarihler', sutunlar: [{ ad: 'Teslim', gizli: false, tip: 'metin' }], satirlar: [{ id: 'r1', ad: 'a', ortamId: null, degerler: { Teslim: 'bugün' } }] };
    const c = ekranBasvurulariniCoz({ ...veri, teslimatTarihi: '${Tarihler.Teslim}' }, { tablolar: [tablo] as never, ortamId: null, alanTipleri: { teslimatTarihi: 'tarih' } });
    expect(c.hatalar).toEqual([]);
    expect(c.veri.teslimatTarihi).toBe('bugün');
    expect(modelKosuPlani(model, c.veri, { simdi: SIMDI }).adimlar.flatMap((a) => a.alanlar).find((a) => a.id === 'teslimatTarihi')).toMatchObject({ deger: '28.09.2026', goreliIfade: 'bugün' });
    // Dışa aktarma: sabit tarih yazılmaz; goreliTarih yardımcısı koşu anında hesaplar.
    const kod = playwrightKoduUret({
      plan, kaynak: { ekran: EKRAN_ADI, senaryo: 'x', modelSurumu: 1, ortam: 'TEST', uretim: SIMDI.toISOString() }, tabanUrl: 'http://127.0.0.1:9', girisGerekli: false
    }).icerik;
    expect(kod).toContain("goreliTarih(\"bugun\", 7, \"gg.aa.yyyy\")");
    expect(kod).toContain('function goreliTarih(');
    expect(kod).not.toContain('05.10.2026');
  });

  test('paket doğrulayıcı: öneride geçmiş sabit tarih uyarı verir; bugün / bugün+N ve gelecek tarih uyarmaz', () => {
    const paket = siparisPaketi() as Nesne;
    const oneri = (tarih: string) => ({ baslik: `Sipariş ${tarih}`, veri: { urunAdi: 'Roman', adet: 2, kategori: 'kitap', renk: 'standart', teslimatTarihi: tarih, telefon: TELEFON },
      beklenenSonuc: { tur: 'basari', aciklama: 'Sipariş alınır.' }, gerekce: 'Ana akış.' });
    paket.senaryoOnerileri = [oneri('01.09.2026'), oneri('bugün+7'), oneri('01.12.2026')];
    const d = sayfaPaketiniDogrula(paket, { simdi: SIMDI });
    const tarihUyarilari = d.uyarilar.filter((u) => u.yer.endsWith('.veri.teslimatTarihi'));
    expect(tarihUyarilari.map((u) => u.yer)).toEqual(['senaryoOnerileri[0].veri.teslimatTarihi']);
    expect(tarihUyarilari[0].mesaj).toContain('"bugün" ya da "bugün+N"');
  });
});

// ---------------------------------------------------------------------------------------
// Koşucu (127.0.0.1)
// ---------------------------------------------------------------------------------------

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Randevu</title></head><body>
<label>Randevu <input id="randevu" type="text"></label>
<label>Son gün <input id="sonGun" type="text"></label>
<button id="kaydet" type="button">Kaydet</button><p id="sonuc"></p>
<script>document.getElementById('kaydet').addEventListener('click', () => { document.getElementById('sonuc').textContent = 'Randevu alındı'; });</script>
</body></html>`;
const alan = (id: string, etiket: string): Nesne => ({
  id, tip: 'tarih', bicim: 'gg.aa.yyyy', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false
});
function randevuModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'randevu', ad: 'Randevu', aciklama: 'Göreli tarih (nötr fikstür).', ekranUrl: '/randevu', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{
      id: 'bilgiler', sira: 1, baslik: 'Randevu bilgileri',
      bolumler: [{ id: 'b', baslik: 'Bilgiler', alanlar: [alan('randevu', 'Randevu'), alan('sonGun', 'Son gün')] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Randevu alındı', secici: '#sonuc' } }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

test.describe('koşucu: göreli tarih sayfaya doğru tarihle yazılır', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => (i.yol === '/randevu' ? { tur: 'text/html; charset=utf-8', govde: SAYFA } : { durum: 404, tur: 'text/plain', govde: 'yok' }));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  test('senaryo "bugün+7" ve tablodan gelen "bugün" → 05.10.2026 / 28.09.2026; raporda ifade → tarih', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const tablo = { id: 't1', ad: 'Tarihler', sutunlar: [{ ad: 'Son', gizli: false, tip: 'metin' }], satirlar: [{ id: 'r1', ad: 'a', ortamId: null, degerler: { Son: 'bugün' } }] };
    const c = ekranBasvurulariniCoz({ baslik: 'Randevu', randevu: 'bugün+7', sonGun: '${Tarihler.Son}' }, { tablolar: [tablo] as never, ortamId: null, alanTipleri: { sonGun: 'tarih' } });
    expect(c.hatalar).toEqual([]);
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    try {
      const ortam: ModelKosuOrtami = {
        veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
        tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => '', simdi: () => SIMDI
      };
      const s: PlatformModelSenaryosu = { id: 's1', baslik: 'Randevu', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'randevu', ad: 'Randevu' }, model: randevuModeli(), modelSurumu: 1, altModeller: {}, veri: c.veri, mutlakaGorunmeli: [] };
      await modelSenaryosunuKos(page, testInfo, s, ortam);
      await expect(page.locator('#randevu')).toHaveValue('05.10.2026');
      await expect(page.locator('#sonGun')).toHaveValue('28.09.2026');
      await expect(page.locator('#sonuc')).toHaveText('Randevu alındı');
      expect(testInfo.annotations.find((a) => a.type === 'goreliTarihler')?.description).toBe('Randevu: bugün+7 → 05.10.2026 · Son gün: bugün → 28.09.2026');
    } finally { await baglam.close(); }
  });
});

// ---------------------------------------------------------------------------------------
// Arayüz (ayrı Nöbetçi, geçici veritabanı)
// ---------------------------------------------------------------------------------------

test.describe('arayüz: senaryo formu ve senaryolar listesi', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Tarih-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };
  const senaryoKaydet = async (baslik: string, teslimatTarihi: string) => String((await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId, baslik, ortamIdleri: [ortamId], kosuyaDahil: false,
    veri: { baslik, urunAdi: 'Roman', adet: 2, kategori: 'kitap', renk: 'standart', teslimatTarihi, telefon: TELEFON }
  })).id);
  const veriAl = async (id: string) => (await basarili(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo.veri as Nesne;
  const tasmaYok = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'goreli-tarih-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Tarih Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: siparisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`);
    ekranId = String((liste.ekranlar as Nesne[]).find((e) => e.ad === EKRAN_ADI)?.id);
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  async function sayfaAc(genislik = 1280): Promise<Page> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 } });
    const page = await baglam.newPage();
    await page.clock.setFixedTime(SIMDI);
    return page;
  }

  test('form: Bugüne göre + önizleme + sınır uyarısı; doğrudan "bugün+7" yazımı; eskiyen sabit tarihte "Bugüne göre yap" ve kayıt', async () => {
    test.setTimeout(90_000);
    const id = await senaryoKaydet('Uzak teslimat', '01.01.2099');
    const page = await sayfaAc();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/duzenle/${id}`);
    const alanKap = page.locator('[data-alan="teslimatTarihi"]');
    await expect(alanKap.getByRole('radio', { name: 'Sabit tarih' })).toBeChecked();
    await expect(alanKap.getByRole('textbox')).toHaveValue('01.01.2099');
    // Eskiyen (bugün koşulursa sınır dışında) sabit tarih: uyarı + öneri.
    const eskime = alanKap.locator('.tarih-eskime');
    await expect(eskime).toBeVisible();
    await expect(eskime).toContainText('Bugün koşulursa en geç bugün+30 (28.10.2026)');
    await expect(eskime).toContainText('Sınıra göre önerilen: bugün+30.');
    await alanKap.getByRole('button', { name: 'Teslimat tarihi: bugüne göre yap' }).click();
    await expect(alanKap.getByRole('radio', { name: 'Bugüne göre' })).toBeChecked();
    await expect(alanKap.getByRole('spinbutton', { name: 'Teslimat tarihi: gün sayısı' })).toHaveValue('30');
    await expect(alanKap.locator('.tarih-onizleme')).toContainText('Bugün koşulursa: 28.10.2026');
    await expect(alanKap.locator('.tarih-sinir-uyarisi')).toBeEmpty();
    // N değişince önizleme; sınır dışı uyarı (en geç / en erken).
    const gun = alanKap.getByRole('spinbutton', { name: 'Teslimat tarihi: gün sayısı' });
    await gun.fill('7');
    await expect(alanKap.locator('.tarih-onizleme')).toContainText('Bugün koşulursa: 05.10.2026');
    await gun.fill('40');
    await expect(alanKap.locator('.tarih-sinir-uyarisi')).toContainText('En geç bugün+30 (28.10.2026)');
    await gun.fill('0');
    await expect(alanKap.locator('.tarih-sinir-uyarisi')).toContainText('En erken bugün+1 (29.09.2026)');
    await alanKap.getByRole('combobox', { name: 'Teslimat tarihi: başlangıç' }).selectOption('aySonu');
    await expect(alanKap.locator('.tarih-onizleme')).toContainText('Bugün koşulursa: 30.09.2026');
    await alanKap.getByRole('combobox', { name: 'Teslimat tarihi: başlangıç' }).selectOption('bugun');
    // Sabit tarihe dönünce önizlenen tarih yazılır; sabit kutuya "bugün+7" yazılınca Bugüne göre'ye geçilir.
    await alanKap.getByRole('radio', { name: 'Sabit tarih' }).check();
    await expect(alanKap.getByRole('textbox')).toHaveValue('28.09.2026');
    await alanKap.getByRole('textbox').fill('bugün+7');
    await alanKap.getByRole('textbox').press('Tab');
    await expect(alanKap.getByRole('radio', { name: 'Bugüne göre' })).toBeChecked();
    await expect(alanKap.locator('.tarih-onizleme')).toContainText('Bugün koşulursa: 05.10.2026');
    // 390 px: taşma yok.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(alanKap.locator('.tarih-goreli')).toBeVisible();
    await tasmaYok(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect.poll(async () => (await veriAl(id)).teslimatTarihi).toBe('bugün+7');
    expect(hatalar).toEqual([]);
    await page.context().close();
  });

  test('liste: "tarih eskidi" rozeti; seçilenler için önizleme → onayla "bugün+N"; 390 px taşma yok', async () => {
    test.setTimeout(90_000);
    const eski = await senaryoKaydet('Çok uzak teslimat', '01.01.2099');
    const gecmis = await senaryoKaydet('Geçmiş teslimat', '01.01.2020');
    await senaryoKaydet('Göreli teslimat', 'bugün+5');
    const page = await sayfaAc();
    await page.goto(`/#/senaryolar/u/${ekranId}`);
    const satir = (b: string) => page.locator('tr[data-senaryo]').filter({ has: page.getByText(b, { exact: true }) });
    await expect(satir('Çok uzak teslimat').locator('.rozet', { hasText: 'tarih eskidi' })).toBeVisible();
    await expect(satir('Geçmiş teslimat').locator('.rozet', { hasText: 'tarih eskidi' })).toBeVisible();
    await expect(satir('Göreli teslimat').locator('.rozet', { hasText: 'tarih eskidi' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Seç: Göreli teslimat' }).check();
    await expect(page.getByRole('button', { name: 'Tarihleri bugüne göre yap…' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Seç: Çok uzak teslimat' }).check();
    await page.getByRole('checkbox', { name: 'Seç: Geçmiş teslimat' }).check();
    await page.getByRole('button', { name: 'Tarihleri bugüne göre yap…' }).click();
    const diyalog = page.getByRole('dialog', { name: 'Tarihleri bugüne göre yap' });
    const onizleme = diyalog.getByRole('table', { name: 'Tarih dönüşümü önizlemesi' });
    await expect(onizleme.locator('tbody tr')).toHaveCount(2);
    await expect(onizleme.locator('tr', { hasText: 'Çok uzak teslimat' })).toContainText('01.01.2099');
    await expect(onizleme.locator('tr', { hasText: 'Çok uzak teslimat' })).toContainText('bugün+30');
    await expect(onizleme.locator('tr', { hasText: 'Geçmiş teslimat' })).toContainText('bugün+1');
    // Onaydan önce hiçbir şey yazılmaz.
    expect((await veriAl(eski)).teslimatTarihi).toBe('01.01.2099');
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await diyalog.getByRole('button', { name: '2 tarihi bugüne göre yap' }).click();
    await expect(diyalog).toBeHidden();
    expect((await veriAl(eski)).teslimatTarihi).toBe('bugün+30');
    expect((await veriAl(gecmis)).teslimatTarihi).toBe('bugün+1');
    await expect(satir('Çok uzak teslimat').locator('.rozet', { hasText: 'tarih eskidi' })).toHaveCount(0);
    await page.context().close();
  });
});
