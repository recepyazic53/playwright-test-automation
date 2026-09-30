// KORUMA TESTİ — Her ekran başka bir akışın önceki / başlangıç adımı olabilir (ayrı "genel senaryo" kaydı gerekmez): genel senaryo
// açma (model-formu.mjs > ortakAkislariAc) başvurulan EKRANIN adımlarını da yerine yerleştirir; ekran kendini doğrudan ya da
// dolaylı içeremez (yer tutucu adım + "donguler"; doğrulayıcı ve akış kaydı reddeder); akış tasarımının listesine tüm ekranlar
// girer (düzenlenen ekran ve onu içeren ekranlar hariç); koşu planı önce başvurulan ekranın adımlarını çalıştırır.
// Nötr fikstür; veritabanı geçicidir, dışarıya istek yok.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranModeliGetir, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { EkranDogrulamaHatasi, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { akisKaydet, akisTasarimi, ortakAkislariListele } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { modelBaglami } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { formSemasiOlustur, ortakAkislariAc, tumFormAlanlari } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const dosyasi = (anahtar: string): string => `${anahtar}.model.json`;

/** Tek adımlı nötr ekran: bir metin alanı + Devam düğmesi. onceki: bu ekranın başında başka ekrana başvuru. */
function ekranModeli(anahtar: string, ad: string, alanId: string, onceki: string[] = []): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: anahtar, ad, aciklama: 'Ekran içine alma (nötr fikstür).', ekranUrl: `/${anahtar}/`, girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: `Nöbetçi > Senaryolar (${anahtar})` },
    kosullar: {},
    adimlar: [
      ...onceki.map((k, i) => ({ id: `once${i + 1}`, sira: i + 1, baslik: `Önce ${k}`, ortakAkis: { dosya: dosyasi(k) } })),
      {
        id: `${anahtar.replace(/-/g, '')}Adimi`, sira: onceki.length + 1, baslik: `${ad} doldurulur`,
        bolumler: [{ id: `${alanId}Bolumu`, baslik: ad, alanlar: [{
          id: alanId, tip: 'metin', etiket: { ekran: `${ad} alanı` }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: alanId }, konum: { secici: `#${alanId}`, kirilganlik: 'dusuk' }
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#sonraki' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const A = ekranModeli('ekran-a', 'Ekran A', 'aAlani');
const B = ekranModeli('ekran-b', 'Ekran B', 'bAlani', ['ekran-a']);
const idler = (m: Nesne): string[] => (m.adimlar as Nesne[]).map((a) => String(a.id));

test.describe('saf işlevler', () => {
  test('ortakAkislariAc: başvurulan EKRAN modelinin adımlarını yerine açar (kimlik "<başvuru>_<adım>", ekran adı korunur)', () => {
    const sonuc = ortakAkislariAc(B, { [dosyasi('ekran-a')]: A });
    expect(sonuc.eksikler).toEqual([]);
    expect(sonuc.donguler).toEqual([]);
    expect(idler(sonuc.model)).toEqual(['once1_ekranaAdimi', 'ekranbAdimi']);
    expect(sonuc.model.adimlar[0].ortakAkisAdi).toBe('Ekran A');
    // Girdi değişmez.
    expect(B.adimlar[0].ortakAkis).toEqual({ dosya: dosyasi('ekran-a') });
    // Form: her iki ekranın alanı da var.
    const alanlar = tumFormAlanlari(formSemasiOlustur(sonuc.model, {})).map((a: Nesne) => a.id);
    expect(alanlar).toEqual(expect.arrayContaining(['aAlani', 'bAlani']));
  });

  test('ekran zinciri (C → B → A) yinelemeyle tümüyle açılır', () => {
    const C = ekranModeli('ekran-c', 'Ekran C', 'cAlani', ['ekran-b']);
    const sonuc = ortakAkislariAc(C, { [dosyasi('ekran-b')]: B, [dosyasi('ekran-a')]: A });
    expect(sonuc.eksikler).toEqual([]);
    expect(idler(sonuc.model)).toEqual(['once1_once1_ekranaAdimi', 'once1_ekranbAdimi', 'ekrancAdimi']);
  });

  test('döngü: ekran kendini doğrudan ya da dolaylı içeremez (yer tutucu adım kalır, "donguler" bildirir)', () => {
    const kendi = ekranModeli('ekran-a', 'Ekran A', 'aAlani', ['ekran-a']);
    const dogrudan = ortakAkislariAc(kendi, { [dosyasi('ekran-a')]: kendi });
    expect(dogrudan.donguler).toEqual([dosyasi('ekran-a')]);
    expect(dogrudan.model.adimlar[0]).toMatchObject({ eksikOrtakAkis: dosyasi('ekran-a'), bolumler: [] });

    const AB = ekranModeli('ekran-a', 'Ekran A', 'aAlani', ['ekran-b']); // A → B → A
    const dolayli = ortakAkislariAc(AB, { [dosyasi('ekran-a')]: AB, [dosyasi('ekran-b')]: B });
    expect(dolayli.donguler).toContain(dosyasi('ekran-a'));
    expect(dolayli.model.adimlar.some((a: Nesne) => typeof a.eksikOrtakAkis === 'string')).toBe(true);
  });

  test('bulunamayan ekran: yer tutucu adım ve "eksikler" (mevcut genel senaryo davranışı)', () => {
    const sonuc = ortakAkislariAc(B, {});
    expect(sonuc.eksikler).toEqual([dosyasi('ekran-a')]);
    expect(sonuc.model.adimlar[0].eksikOrtakAkis).toBe(dosyasi('ekran-a'));
  });

  test('koşu planı: önce başvurulan ekranın adımları (kendi tıklaması) koşar, sonra ekranın kendi adımı', () => {
    const acik = ortakAkislariAc(B, { [dosyasi('ekran-a')]: A }).model;
    const plan = modelKosuPlani(acik, { baslik: 'x', aAlani: 'a', bAlani: 'b' }, { altModeller: {} });
    expect(plan.hatalar).toEqual([]);
    const metin = JSON.stringify(plan.adimlar);
    expect(metin.indexOf('aAlani')).toBeGreaterThanOrEqual(0);
    expect(metin.indexOf('aAlani')).toBeLessThan(metin.indexOf('bAlani'));
  });

  test('doğrulayıcı: ekran başvurusu kabul edilir; alt model ve kendini içeren zincir reddedilir', () => {
    const kaynak = (harita: Record<string, Nesne>) => (d: string): unknown => { if (!(d in harita)) throw new Error(`"${d}" yok`); return harita[d]; };
    expect(() => ekranModeliniDogrula('ekran-b.model.json', kopya(B), kaynak({ [dosyasi('ekran-a')]: A }))).not.toThrow();
    const ALT = { semaSurumu: 2, tur: 'altModel', id: 'ekran-a' };
    expect(() => ekranModeliniDogrula('ekran-b.model.json', kopya(B), kaynak({ [dosyasi('ekran-a')]: ALT }))).toThrow(/genel senaryo ya da ekran değil/);
    const AB = ekranModeli('ekran-a', 'Ekran A', 'aAlani', ['ekran-b']);
    expect(() => ekranModeliniDogrula('ekran-a.model.json', kopya(AB), kaynak({ [dosyasi('ekran-b')]: B }))).toThrow(/kendini içeremez/);
    const KENDI = ekranModeli('ekran-a', 'Ekran A', 'aAlani', ['ekran-a']);
    expect(() => ekranModeliniDogrula('ekran-a.model.json', kopya(KENDI), kaynak({ [dosyasi('ekran-a')]: KENDI }))).toThrow(/kendini içeremez/);
  });
});

test.describe('veritabanı: iki ekran, ikinci ekranın akışı önce birinci ekrana gider', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  let ekranA: string;
  let ekranB: string;
  const paket = (model: Nesne): Nesne => ({
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: model.id, ad: model.ad, urlYolu: model.ekranUrl }, olusturan: 'test', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür.' },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
    bilinmeyenler: []
  });
  test.beforeEach(async () => {
    klasor = geciciKlasor('ekran-ekran');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Ekran-Ekran-Kasa-Parolasi-5', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor.yol, 'medya') };
    ekranA = (await sayfaEkle(vt, projeId, paket(kopya(A)), secenek)).ekranId;
    ekranB = (await sayfaEkle(vt, projeId, paket(ekranModeli('ekran-b', 'Ekran B', 'bAlani')), secenek)).ekranId;
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });
  const blokEkle = (ekranId: string, dosya: string, ad: string): { surum: number } => {
    const bloklar = kopya(akisTasarimi(vt, projeId, ekranId, { akisId: 'ana' }).bloklar);
    bloklar.splice(0, 0, { tur: 'ortak', dosya, ad, istegeBagli: false } as never);
    return akisKaydet(vt, projeId, ekranId, { akisId: 'ana', ad: 'Ana akış', bloklar, onay: true }) as { surum: number };
  };
  const hatasi = (ekranId: string, dosya: string): string => {
    try { blokEkle(ekranId, dosya, 'x'); } catch (e) { if (e instanceof EkranDogrulamaHatasi) return e.hatalar.map((x: Nesne) => x.mesaj).join(' '); throw e; }
    return '';
  };

  test('akış tasarımının listesinde ekranlar "ekran" türüyle görünür; düzenlenen ekran listede yoktur', () => {
    const liste = ortakAkislariListele(vt, projeId, ekranB);
    expect(liste.map((x) => [x.dosya, x.tur])).toEqual([[dosyasi('ekran-a'), 'ekran']]);
    expect(akisTasarimi(vt, projeId, ekranB, { akisId: 'ana' }).ortakAkislar.map((x) => x.dosya)).toEqual([dosyasi('ekran-a')]);
    expect(ortakAkislariListele(vt, projeId, ekranA).map((x) => x.dosya)).toEqual([dosyasi('ekran-b')]);
  });

  test('ikinci ekranın akışına birinci ekran eklenir; ekran modeli yüklenince adımlar açılmış gelir', () => {
    blokEkle(ekranB, dosyasi('ekran-a'), 'Ekran A');
    const mb = modelBaglami(vt, ekranB);
    expect(mb).not.toBeNull();
    expect(mb?.eksikOrtakAkislar).toEqual([]);
    const model = mb?.model as Nesne;
    expect(idler(model).some((i) => i.endsWith('_ekranaAdimi'))).toBe(true);
    expect(idler(model).indexOf(idler(model).find((i) => i.endsWith('_ekranaAdimi')) as string)).toBeLessThan(idler(model).indexOf('ekranbAdimi'));
    // Kayıtlı ham model başvuruyu adım olarak taşır (silme / dönüştürme yok).
    const ham = (ekranModeliGetir(vt, ekranB) as { model: Nesne }).model;
    expect(JSON.stringify(ham)).toContain(dosyasi('ekran-a'));
    // Döngü kurulamaz: onu kullanan ekran listeden düşer.
    expect(ortakAkislariListele(vt, projeId, ekranA)).toEqual([]);
  });

  test('sunucu doğrulaması: ekran kendini ya da kendini kullanan ekranı içeremez', () => {
    expect(hatasi(ekranB, dosyasi('ekran-b'))).toMatch(/kendi içine/);
    blokEkle(ekranB, dosyasi('ekran-a'), 'Ekran A');
    expect(hatasi(ekranA, dosyasi('ekran-b'))).toMatch(/kendi içine/);
  });
});
