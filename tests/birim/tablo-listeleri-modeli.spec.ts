// KORUMA TESTLERİ — koşullu liste çözümü ve modele uygulama (ekran alanlarının tablo bağlantılarından üretilen listeler;
// bkz. tablo-secimi.mjs tabloDegerListeleri): en çok koşulu tutan liste seçilir; koşulsuz liste seçenekleri, tek koşullu liste
// bağımlılık haritasını belirler; koşu sayfa değerini bulur. Saf modüller.
import { expect, test } from '@playwright/test';
import { birlesikDegerler, eslesenListeler, type ParametreTanimi } from '../../scripts/platform/servisler/parametre-tanimlari.mjs';
import { modeleListeleriUygula } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { secenekBul } from '../../scripts/platform/senaryolar/model-kosusu.mjs';


test('koşullu liste çözümü: en çok koşulu tutan liste; tutan yoksa koşulsuz; değerler birleşir', () => {
  const l = (id: string, kosullar: Array<{ alan: string; deger: string }>, degerler: string[]): ParametreTanimi =>
    ({ id, ad: id, tur: 'liste', kullanim: 'ekran', hedef: { ekranId: 'e', alan: 'ulke' }, kosullar, degerler: degerler.map((deger) => ({ deger })) });
  const listeler = [l('genel', [], ['1', '2', '3']), l('dunya', [{ alan: 'kapsam', deger: 'D' }], ['1', '2']),
    l('dunyaVize', [{ alan: 'kapsam', deger: 'D' }, { alan: 'alternatif', deger: 'V' }], ['2']), l('dunyaVize2', [{ alan: 'kapsam', deger: 'D' }, { alan: 'alternatif', deger: 'V' }], ['4'])];
  const cozum = (d: Record<string, string>) => eslesenListeler(listeler, (t) => t.hedef?.alan === 'ulke', (a) => d[a]).map((t) => t.id);
  expect(cozum({})).toEqual(['genel']);
  expect(cozum({ kapsam: 'D' })).toEqual(['dunya']);
  expect(cozum({ kapsam: 'D', alternatif: 'V' })).toEqual(['dunyaVize', 'dunyaVize2']);
  expect(birlesikDegerler(eslesenListeler(listeler, () => true, (a) => ({ kapsam: 'D', alternatif: 'V' } as Record<string, string>)[a])).map((x) => x.deger)).toEqual(['2', '4']);
});

test('model ↔ değer listeleri: koşulsuz liste seçenekleri değiştirir, tek koşullu bağımlılık haritasını, diğerleri ekler; koşu sayfa değerini bulur', () => {
  const alan = (id: string, ek: Record<string, unknown>) => ({ id, tip: 'secim', yapilandirma: 'senaryo', etiket: { form: id.toUpperCase() }, ...ek });
  const model = { adimlar: [{ id: 'a', bolumler: [{ id: 'b', alanlar: [
    alan('kapsam', { secenekler: [{ deger: '1', metin: 'DÜNYA', senaryoDegeri: 'D' }, { deger: '2', metin: 'AVRUPA', senaryoDegeri: 'A' }] }),
    alan('plan', { secenekler: [{ deger: '1', metin: 'Plan 1' }, { deger: '2', metin: 'Plan 2' }] }),
    alan('ulke', { secenekler: null, bagimlilik: { alan: 'kapsam', secenekHaritasi: { D: [{ deger: '10', metin: 'ABD' }, { deger: '15', metin: 'ALMANYA' }], A: [{ deger: '15', metin: 'ALMANYA' }] } } })
  ] }] }] };
  const liste = (alanId: string, kosullar: Array<{ alan: string; deger: string }>, degerler: Array<Record<string, string>>) => ({ hedef: { ekranId: 'e', alan: alanId }, kosullar, degerler: degerler as Array<{ deger: string }> });
  const yeni = modeleListeleriUygula(model, [
    liste('plan', [], [{ deger: '1' }, { deger: '9', aciklama: 'Plan 9', ekranDegeri: '09', ekranMetni: 'PLAN 9' }]),
    liste('ulke', [{ alan: 'kapsam', deger: 'A' }], [{ deger: '20', aciklama: 'FRANSA' }]),
    liste('ulke', [{ alan: 'kapsam', deger: 'D' }, { alan: 'alternatif', deger: 'V' }], [{ deger: '30', aciklama: 'JAPONYA' }])
  ]) as typeof model;
  const [, plan, ulke] = yeni.adimlar[0].bolumler[0].alanlar as Array<Record<string, any>>;
  expect(plan.secenekler).toEqual([{ deger: '1', metin: 'Plan 1' }, { deger: '09', senaryoDegeri: '9', metin: 'PLAN 9', formMetni: 'Plan 9' }]);
  expect(secenekBul(plan.secenekler, '9')).toMatchObject({ deger: '09', metin: 'PLAN 9' });
  expect(ulke.bagimlilik.secenekHaritasi.A).toEqual([{ deger: '20', metin: 'FRANSA', formMetni: 'FRANSA' }]);
  expect(ulke.bagimlilik.secenekHaritasi.D.map((x: Record<string, string>) => x.deger)).toEqual(['10', '15', '30']);
  expect((model.adimlar[0].bolumler[0].alanlar[1] as Record<string, any>).secenekler).toHaveLength(2);
});

