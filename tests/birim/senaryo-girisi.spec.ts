// KORUMA TESTİ — senaryonun giriş seçimi (scripts/platform/senaryolar/senaryo-girisi.mjs) ve akıştaki "Yeniden giriş" adımı
// (model doğrulayıcı, koşu planı, akış tasarımı → kayıt envanteri, model → diyagram blokları). Tarayıcı açmaz, ağa çıkmaz.
import { expect, test } from '@playwright/test';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { etkinSenaryoGirisi, senaryoGirisi, senaryoGirisiniAyikla } from '../../scripts/platform/senaryolar/senaryo-girisi.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { adimlardanBloklar } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { ornekBasvuruModeli, ornekBasvuruPaketi } from './model-fikstur';

type Nesne = Record<string, unknown>;
const dogrula = (model: unknown) => ekranModeliniDogrula('model', model, () => { throw new Error('alt model yok'); });
const yenidenGirisli = (model: Nesne, profil?: string): Nesne => {
  const adimlar = (model.adimlar as Nesne[]).map((a) => ({ ...a }));
  const ek = { id: 'yeniden-giris', sira: adimlar.length + 1, baslik: 'Onaycı olarak girilir', yenidenGiris: profil ? { profil } : {} };
  return { ...model, adimlar: [...adimlar, ek] };
};

test('giriş seçimi: varsayılan içeriğe yazılmaz; geçersiz kip açık hata; girişsiz modelde her zaman girişsiz', () => {
  expect(senaryoGirisiniAyikla(undefined)).toEqual({ giris: null, hatalar: [] });
  expect(senaryoGirisiniAyikla({ kip: 'ortam' })).toEqual({ giris: null, hatalar: [] });
  expect(senaryoGirisiniAyikla({ kip: 'ortam', profil: ' Onaycı ' }).giris).toEqual({ kip: 'ortam', profil: 'Onaycı' });
  expect(senaryoGirisiniAyikla({ kip: 'girissiz', profil: 'X' }).giris).toEqual({ kip: 'girissiz', profil: null });
  expect(senaryoGirisiniAyikla({ kip: 'temiz' }).giris).toEqual({ kip: 'temiz', profil: null });
  expect(senaryoGirisiniAyikla({ kip: 'belki' }).hatalar[0]).toMatch(/yalnızca ortam, girissiz, temiz/);
  expect(senaryoGirisi({ kosucu: 'model' })).toBeNull(); // eski senaryo: bugünkü davranış
  expect(etkinSenaryoGirisi(null, {})).toEqual({ kip: 'ortam', profil: null });
  expect(etkinSenaryoGirisi({ kip: 'temiz', profil: 'Onaycı' }, { girisGerekmez: true })).toEqual({ kip: 'girissiz', profil: null });
});

test('yeniden giriş adımı: model doğrulanır (girişsiz modelde olmaz), koşu planına girer', () => {
  const model = yenidenGirisli(ornekBasvuruModeli(), 'Onaycı');
  expect(() => dogrula(model)).not.toThrow();
  expect(() => dogrula({ ...model, girisGerekmez: true })).toThrow(/girişsiz modelde .* yeniden giriş adımı olmaz/);
  const bozuk = yenidenGirisli(ornekBasvuruModeli());
  ((bozuk.adimlar as Nesne[])[3] as Nesne).bolumler = [];
  expect(() => dogrula(bozuk)).toThrow(/yalnızca biri olmalı/);
  const p = ornekBasvuruPaketi();
  const o = (p.senaryoOnerileri as Nesne[])[0];
  const plan = modelKosuPlani(model, { ...(o.veri as Nesne), onayAdimiDahil: true }, {});
  expect(plan.hatalar).toEqual([]);
  const son = plan.adimlar[plan.adimlar.length - 1];
  expect(son).toMatchObject({ id: 'yeniden-giris', dahil: true, yenidenGiris: { profil: 'Onaycı' }, alanlar: [] });
});

test('akış tasarımı: "Yeniden giriş" bloğu kendi adımıdır; aksiyondan sonra gelir; model → blok geri çevrilir', () => {
  const env = {
    kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Form', engellenenler: [], notlar: [], mesajlar: [], olaylar: [],
    alanlar: [{ alan: { anahtar: 'ad', tur: 'text', etiket: 'Ad', secici: '#ad', adaySeciciler: [], bolum: { anahtar: 'b', baslik: 'Bilgi' } }, secili: true }],
    dugmeler: [{ secici: '#gonder', metin: 'Gönder' }]
  } as unknown as Parameters<typeof akistanKayitEnvanteri>[0];
  const { bloklar, hatalar } = bloklariAyikla([
    { tur: 'alanlar', ad: 'Bilgi', alanlar: ['ad'], zorunlu: [] }, { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'giris', ad: 'Onaycı girer', profil: 'Onaycı' }, { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const r = akistanKayitEnvanteri(env, bloklar);
  expect(r.hatalar).toEqual([]);
  expect(r.envanter?.adimlar.map((a) => [a.ad, a.yenidenGiris ?? null])).toEqual([['Bilgi', null], ['Onaycı girer', { profil: 'Onaycı' }]]);
  // Aksiyonsuz alan grubundan hemen sonra yeniden giriş olmaz (adım kapanmadı).
  const kotu = akistanKayitEnvanteri(env, bloklariAyikla([{ tur: 'alanlar', ad: 'Bilgi', alanlar: ['ad'], zorunlu: [] }, { tur: 'giris', ad: '', profil: null }, { tur: 'bitir' }]).bloklar);
  expect(kotu.hatalar.map((x) => x.mesaj).join(' ')).toMatch(/Yeniden giriş bir aksiyondan/);
  const model = yenidenGirisli(ornekBasvuruModeli(), 'Onaycı');
  const geri = adimlardanBloklar(model, model.adimlar as Nesne[], env);
  expect(geri.filter((b) => b.tur === 'giris')).toEqual([{ tur: 'giris', ad: 'Onaycı olarak girilir', profil: 'Onaycı' }]);
});
