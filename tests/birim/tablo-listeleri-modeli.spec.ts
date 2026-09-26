// KORUMA TESTLERİ — koşullu liste çözümü ve modele uygulama (ekran alanlarının tablo bağlantılarından üretilen listeler;
// bkz. tablo-secimi.mjs tabloDegerListeleri): en çok koşulu tutan liste seçilir; koşulsuz liste seçenekleri, tek koşullu liste
// bağımlılık haritasını belirler; koşu sayfa değerini bulur (modeldeki seçenekten ya da tablo sütununun karşılığından). Saf modüller.
import { expect, test } from '@playwright/test';
import { birlesikDegerler, eslesenListeler, type ParametreTanimi } from '../../scripts/platform/servisler/parametre-tanimlari.mjs';
import { modeleListeleriUygula } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { secenekBul } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { servisDegeri, tabloDegerListeleri, type Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';


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


test('karşılıklar: tablo listesi sayfa değerini taşır; modelde seçenek olmasa da koşu sayfa değeriyle seçer; servise servis değeri', () => {
  const tablo: Tablo = { id: 't', ad: 'Seyahat', satirlar: [['DÜNYA', 'ALMANYA'], ['DÜNYA', 'A.B.D'], ['AVRUPA', 'ALMANYA']].map(([k, u]) => ({ ortamId: null, degerler: { Kapsam: k, Ülke: u } })),
    sutunlar: [{ ad: 'Kapsam', gizli: false, karsiliklar: { 'DÜNYA': { sayfa: 'D1', servis: 'WORLD' } } }, { ad: 'Ülke', gizli: false, karsiliklar: { 'A.B.D': { sayfa: '1' }, 'ALMANYA': { sayfa: '15' } } }] };
  const listeler = tabloDegerListeleri({ kapsam: { tablo: 't', sutun: 'Kapsam' }, ulke: { tablo: 't', sutun: 'Ülke' } }, [tablo], 'e', ['kapsam', 'ulke']);
  expect(listeler.find((l) => l.hedef.alan === 'kapsam')?.degerler).toEqual([{ deger: 'DÜNYA', ekranDegeri: 'D1' }, { deger: 'AVRUPA' }]);
  // Modelde seçenek listesi yok (yalnız alan): seçenekler tablodan, sayfa değeriyle.
  const alan = (id: string, ek: Record<string, unknown>) => ({ id, tip: 'secim', yapilandirma: 'senaryo', etiket: { form: id }, ...ek });
  const model = { adimlar: [{ id: 'a', bolumler: [{ id: 'b', alanlar: [alan('kapsam', { secenekler: [] }), alan('ulke', { secenekler: null, seceneklerDurumu: 'bilinmiyor' })] }] }] };
  const yeni = modeleListeleriUygula(model, listeler) as typeof model;
  const [kapsam, ulke] = yeni.adimlar[0].bolumler[0].alanlar as Array<Record<string, any>>;
  expect(secenekBul(kapsam.secenekler, 'DÜNYA')).toMatchObject({ deger: 'D1', metin: 'DÜNYA' });
  expect(secenekBul(kapsam.secenekler, 'AVRUPA')).toMatchObject({ deger: 'AVRUPA', metin: 'AVRUPA' });
  expect(secenekBul(ulke.secenekler, 'A.B.D')).toMatchObject({ deger: '1', metin: 'A.B.D' });
  expect(servisDegeri(tablo.sutunlar[0], 'DÜNYA')).toBe('WORLD');
  expect(servisDegeri(tablo.sutunlar[0], 'AVRUPA')).toBe('AVRUPA');
  expect(servisDegeri(tablo.sutunlar[1], 'ALMANYA')).toBe('ALMANYA');
});

test('karşılıklar: tabloda okunur ad + sayfa değeri → model seçeneği sayfa değeriyle eşleşir (seçici korunur); koddaki varsayılan ada çevrilir', () => {
  const model = { adimlar: [{ id: 'a', bolumler: [{ id: 'b', alanlar: [
    { id: 'tip', tip: 'radyo', yapilandirma: 'senaryo', etiket: { form: 'Tip' }, varsayilan: { deger: 'O' },
      secenekler: [{ deger: 'O', metin: 'Özel', secici: '#Tip-O' }, { deger: 'T', metin: 'Tüzel', secici: '#Tip-T' }] }
  ] }] }] };
  const yeni = modeleListeleriUygula(model, [{ hedef: { alan: 'tip' }, kosullar: [], degerler: [{ deger: 'Özel', ekranDegeri: 'O' }, { deger: 'Tüzel', ekranDegeri: 'T' }] }]) as typeof model;
  const tip = yeni.adimlar[0].bolumler[0].alanlar[0] as Record<string, any>;
  expect(secenekBul(tip.secenekler, 'Tüzel')).toEqual({ deger: 'T', metin: 'Tüzel', secici: '#Tip-T' });
  expect(tip.varsayilan).toEqual({ deger: 'Özel' });
  // Varsayılan zaten listede olan bir değerse dokunulmaz.
  const ayni = modeleListeleriUygula(model, [{ hedef: { alan: 'tip' }, kosullar: [], degerler: [{ deger: 'O' }, { deger: 'T' }] }]) as typeof model;
  expect((ayni.adimlar[0].bolumler[0].alanlar[0] as Record<string, any>).varsayilan).toEqual({ deger: 'O' });
});
