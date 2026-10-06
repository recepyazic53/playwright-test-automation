// TABLO / SÜTUN YENİDEN ADLANDIRMA (ad-degisikligi.mjs): tablo ya da sütun adı değişince adıyla kullanan başvurular kırılmaz.
// Ekran senaryosu değerleri (${Tablo.Sütun}, etiketli), satır seçimlerinin sütun adları, ekran alan bağlarının sütunu, servis alan bağı /
// hesap kuralı / servis senaryosu gövdesi aynı kayıtta yeni ada çevrilir; kırık başvuru oluşmaz. Geçici veritabanı; değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { adEslemi } from '../../scripts/platform/tablolar/ad-degisikligi.mjs';
import { akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

test('saf: ad eşlemi yalnız değişiklik varsa; sütun eskiAd → ad', () => {
  const eski = { ad: 'Araç listesi', sutunlar: [{ ad: 'Plaka' }, { ad: 'Kod' }] };
  expect(adEslemi(eski, 'Araç listesi', [{ ad: 'Plaka' }, { ad: 'Kod' }])).toBeNull();
  const e = adEslemi(eski, 'Araç bilgileri', [{ ad: 'Plaka no', eskiAd: 'Plaka' }, { ad: 'Kod' }]);
  expect(e?.get('araç listesi')?.yeniAd).toBe('Araç bilgileri');
  expect([...(e?.get('araç listesi')?.sutunlar ?? new Map())]).toEqual([['plaka', 'Plaka no']]);
});

test.describe('uçtan uca: yeniden adlandırma başvuruları taşır (127.0.0.1)', () => {
  const PAROLA = `Gecici-Ad-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  let tabloId = '';
  let servisId = '';
  let servisSenaryoId = '';
  let senaryoId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablo-ad-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Ad Projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    tabloId = tabloKaydet(vt, { projeId, ad: 'Araç listesi', sutunlar: [{ ad: 'Plaka' }, { ad: 'Kod' }], satirlar: [{ ad: 'a1', degerler: { Plaka: '34 AB 1', Kod: 'K1' } }, { ad: 'a2', degerler: { Plaka: '06 CD 2', Kod: 'K2' } }] });
    servisId = servisKaydet(vt, { projeId, anahtar: 'arac', ad: 'Araç servisi', tur: 'rest', ayarlar: {
      yol: '/api', operasyonlar: [{ ad: 'Sorgula', metot: 'POST', yol: '/sorgu' }],
      alanBaglari: { Sorgula: { 'arac/plaka': { tablo: tabloId, sutun: 'Plaka' } } }, tarihKurallari: { PLAKA: '${Araç listesi.Plaka}' }
    } });
    servisSenaryoId = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Sorgu', icerik: {
      operasyon: 'Sorgula', govde: '{"plaka":"${Araç listesi.Plaka}"}', kontroller: [{ tur: 'durumKodu', deger: '200' }],
      http: { metot: 'POST', yol: '/sorgu', icerikTuru: 'application/json' }, tabloSecimleri: { [`${tabloId}|`]: { Plaka: '06 CD 2' } }
    } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const paket = akisPaketi({ anahtar: 'arac-formu', ad: 'Araç formu' });
    const model = akisModeli() as Nesne;
    model.id = 'arac-formu';
    model.ad = 'Araç formu';
    const alan = (id: string, etiket: string): Nesne => ({ id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false });
    (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push(alan('plaka', 'Plaka'), alan('plaka2', 'Plaka 2'));
    paket.model = model;
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'Araç formu')?.id);
    senaryoId = String((await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Plakalı', ortamIdleri: [ortamId],
      veri: { baslik: 'Plakalı', kategori: 'K1', urun: 'Ürün A', plaka: '${Araç listesi.Plaka}', plaka2: '${Araç listesi[ikinci].Plaka}' },
      tabloSecimleri: { [`${tabloId}|`]: { Plaka: '34 AB 1' }, [`${tabloId}|ikinci`]: { Plaka: '06 CD 2' } } })).id);
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { plaka: { tablo: tabloId, sutun: 'Plaka' } } });
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('tablo ve sütun yeniden adlandırılınca senaryo, satır seçimi, ekran / servis bağı, hesap kuralı ve servis gövdesi yeni adı kullanır', async () => {
    const t = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((x) => x.id === tabloId) as Nesne;
    const y = await basarili('/platform/tablo/kaydet', { projeId, id: tabloId, ad: 'Araç bilgileri', sutunlar: [{ ad: 'Plaka no', eskiAd: 'Plaka' }, { ad: 'Kod', eskiAd: 'Kod' }],
      satirlar: (t.satirlar as Nesne[]).map((r) => ({ id: r.id, ad: r.ad, degerler: { 'Plaka no': r.degerler.Plaka, Kod: r.degerler.Kod } })) });
    expect(y.adDegisikligi).toMatchObject({ ekranSenaryolari: 1, servisSenaryolari: 1, servisler: 1, ekranBaglari: 1 });
    const s = (await api(`/platform/senaryo?id=${senaryoId}&ortamId=${ortamId}`)).senaryo as Nesne;
    expect(s.veri).toMatchObject({ plaka: '${Araç bilgileri.Plaka no}', plaka2: '${Araç bilgileri[ikinci].Plaka no}' });
    expect(s.tabloSecimleri).toEqual({ [`${tabloId}|`]: { 'Plaka no': '34 AB 1' }, [`${tabloId}|ikinci`]: { 'Plaka no': '06 CD 2' } });
    expect(((await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar as Nesne).plaka).toEqual({ tablo: tabloId, sutun: 'Plaka no' });
    const sv = (await api(`/platform/servis?projeId=${projeId}&id=${servisId}`)) as Nesne;
    const servis = (sv.servis ?? sv) as Nesne;
    expect(servis.ayarlar.alanBaglari.Sorgula['arac/plaka']).toEqual({ tablo: tabloId, sutun: 'Plaka no' });
    expect(servis.ayarlar.tarihKurallari.PLAKA).toBe('${Araç bilgileri.Plaka no}');
    const kirik = (await api(`/platform/tablolar/veri-sagligi?projeId=${projeId}`)).kirikBasvurular as Nesne[];
    expect(kirik, JSON.stringify(kirik)).toEqual([]);
    expect(servisSenaryoId).toBeTruthy();
  });
});
