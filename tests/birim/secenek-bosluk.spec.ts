// KORUMA TESTİ — sitenin seçenek kodu boşluklu gelebilir (ör. <option value=" 5">): senaryodaki "5" geçerli sayılır (doğrulayıcı
// boşluktan bağımsız karşılaştırır; koşucu da öyle eşler). Farklı değer yine reddedilir.
import { expect, test } from '@playwright/test';
import { senaryoyuDogrula } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';

const model = {
  semaSurumu: 2, tur: 'ekran', id: 'm', ad: 'M', aciklama: 'x', ekranUrl: '/x', kosullar: {},
  adimlar: [{ id: 'a', sira: 1, baslik: 'A', bolumler: [{ id: 'b', baslik: 'B', alanlar: [
    { id: 'muafiyet', tip: 'secim', etiket: { ekran: 'Muafiyet' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'muafiyet' },
      secenekler: [{ deger: ' 2', metin: '%2' }, { deger: ' 5', metin: '%5' }, { deger: '10', metin: '%10' }], konum: { secici: '#m', kirilganlik: 'dusuk' } }
  ] }] }],
  senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
};

test('boşluklu seçenek kodu: "5" ve " 5" geçerli, "7" geçersiz', () => {
  const hatalar = (deger: string) => JSON.stringify(senaryoyuDogrula({ baslik: 'x', muafiyet: deger }, { model: model as never, kaynak: 'kayit' }));
  expect(hatalar('5')).not.toContain('geçerli değil');
  expect(hatalar(' 5')).not.toContain('geçerli değil');
  expect(hatalar('7')).toContain('geçerli değil');
});
