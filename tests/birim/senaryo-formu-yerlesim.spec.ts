// KORUMA TESTİ — senaryo formu şeması: adımları seçen senaryo ayarı (ör. "Ödeme şekli: kart / açık hesap") formun başı yerine,
// o ayara bağlı ilk adımdan hemen önceki ve ayara bağlı olmayan adımın başında gösterilir. Kapsam anahtarı (Dahil) ve ayara bağlı
// olmayan senaryo alanları yerinde kalır. Ağ yok.
import { expect, test } from '@playwright/test';
import { formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';

type Nesne = Record<string, any>;

const adim = (id: string, sira: number, ek: Nesne = {}): Nesne => ({
  id, sira, baslik: id, bolumler: [{ id: `${id}B`, baslik: id, alanlar: [
    { id: `${id}Alan`, tip: 'metin', yapilandirma: 'senaryo', eslesme: { senaryo: `${id}Alan` }, konum: { secici: `#${id}`, kirilganlik: 'dusuk' } }
  ] }], ...ek
});

function model(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'ornek', ad: 'Örnek', aciklama: '', ekranUrl: '/', specDosyasi: 'x', pageObject: 'x', veriKaynaklari: {},
    kosullar: {
      dahil: { ifade: { senaryoAyari: 'islemDahil', esit: true } },
      yolX: { ifade: { ve: [{ senaryoAyari: 'islemDahil', esit: true }, { senaryoAyari: 'yontem', esit: 'x' }] } },
      yolY: { ifade: { senaryoAyari: 'yontem', esit: 'y' } }
    },
    adimlar: [adim('giris', 1), adim('secim', 2, { gorunurluk: { kosul: 'dahil' } }), adim('x', 3, { gorunurluk: { kosul: 'yolX' } }), adim('y', 4, { gorunurluk: { kosul: 'yolY' } })],
    senaryoDuzeyi: { alanlar: [
      { id: 'islemDahil', tip: 'onayKutusu', yapilandirma: 'senaryo', eslesme: { senaryo: 'islemDahil' }, etiket: { ekran: null, form: 'İşlem dahil' } },
      { id: 'yontem', tip: 'secim', zorunlu: true, yapilandirma: 'senaryo', ekrandaAlanDegil: true, eslesme: { senaryo: 'yontem' }, etiket: { ekran: null, form: 'Yöntem' },
        secenekler: [{ deger: 'x', metin: 'X' }, { deger: 'y', metin: 'Y' }] },
      { id: 'serbest', tip: 'metin', yapilandirma: 'senaryo', eslesme: { senaryo: 'serbest' }, etiket: { ekran: null, form: 'Serbest' } }
    ] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

test('adımları seçen ayar, ona bağlı ilk adımdan önceki bağımsız adımın başında; kapsam anahtarı ve bağımsız alanlar yerinde', () => {
  const s = formSemasiOlustur(model());
  const alanlar = (id: string) => (s.adimlar.find((a: Nesne) => a.id === id) as Nesne).bolumler.flatMap((b: Nesne) => b.alanlar.map((a: Nesne) => a.id));
  expect(alanlar('secim')).toEqual(['yontem', 'secimAlan']);
  expect(alanlar('x')).toEqual(['xAlan']);
  expect(alanlar('giris')).toEqual(['girisAlan']);
  expect(s.senaryoAlanlari.map((a: Nesne) => a.id)).toEqual(['serbest']);
  expect(s.adimKapsami.map((k: Nesne) => k.alanId)).toEqual(['islemDahil']);
});

test('ayara bağlı ilk adım en baştaysa ya da önceki adım da ona bağlıysa ayar senaryo kartında kalır', () => {
  const m = model();
  m.adimlar = [adim('x', 1, { gorunurluk: { kosul: 'yolY' } }), adim('y', 2, { gorunurluk: { kosul: 'yolY' } })];
  expect(formSemasiOlustur(m).senaryoAlanlari.map((a: Nesne) => a.id)).toEqual(['islemDahil', 'yontem', 'serbest']);
});
