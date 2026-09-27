// Senaryo akış diyagramı (saf hesap): modelden adımlar, koşullu alanların okunuşu, bu senaryonun kapsamı, beklenen
// sonuç ve son koşunun adım sonuçlarının adımlara eşlenmesi. Arayüzdeki çizim akis-kaydi.spec.ts'de (gerçek koşuyla).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { BAGLAM_ADIMI_ONEKI, BASLANGIC_ADIMLARI, akisDiyagrami, ifadeMetni } from '../../scripts/platform/senaryolar/akis-diyagrami.mjs';

const model = {
  id: 'deneme', ad: 'Deneme ekranı',
  adimlar: [
    {
      id: 'bilgi', sira: 1, baslik: 'Bilgiler',
      bolumler: [{
        id: 'genel', baslik: 'Genel', alanlar: [
          { id: 'tip', tip: 'radyo', etiket: { ekran: 'Müşteri tipi' }, yapilandirma: 'senaryo', secenekler: [{ deger: 'b', metin: 'Bireysel' }, { deger: 'k', metin: 'Kurumsal' }] },
          { id: 'vkn', tip: 'metin', etiket: { ekran: 'Vergi no' }, yapilandirma: 'senaryo', gorunurluk: { kosul: 'vknGorunur' } },
          { id: 'not', tip: 'metin', etiket: { ekran: 'Not' }, yapilandirma: 'senaryo', gorunurluk: { kosul: 'aciklamali' } },
          { id: 'eposta', tip: 'metin', etiket: { ekran: 'E-posta' }, yapilandirma: 'senaryo', gorunurluk: { kosul: 'ikiSecenek' } },
          { id: 'devamDugmesi', tip: 'buton', etiket: { ekran: 'Devam' }, yapilandirma: 'aksiyon' }
        ]
      }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#onay' } }
    },
    { id: 'ek', sira: 2, baslik: 'Ek adım', gorunurluk: { kosul: 'ekKosulu' }, bolumler: [] },
    {
      id: 'onay', sira: 3, baslik: 'Onay', bolumler: [],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi' } }
    }
  ],
  kosullar: {
    vknGorunur: { ifade: { alan: 'tip', esit: 'k' } },
    // Okunamayan ifade (bağlama bağlı) → açıklama; okunabilen ifadede açıklama yerine kısa okunuş.
    aciklamali: { ifade: { sube: { alanSeti: 'x' } }, aciklama: 'Şubeye göre görünür' },
    ikiSecenek: { ifade: { alan: 'tip', icinde: ['b', 'k'] }, aciklama: 'Tip seçilince görünür (akış kaydı).' },
    ekKosulu: { ifade: { senaryoAyari: 'ekDahil', esit: true } }
  },
  senaryoDuzeyi: { alanlar: [{ id: 'ekDahil', tip: 'onayKutusu', etiket: { ekran: null, form: 'Ek adım dahil' }, yapilandirma: 'senaryo' }] }
};
const bireysel = { adimlar: { bilgi: true, ek: false, onay: true }, alanlar: { tip: true, vkn: false, not: true } };

test('akış: adımlar, koşullu alanların okunuşu, bu senaryonun kapsamı, ilerleme düğmesi ve bitiş (koşu sonucu yok)', () => {
  const d = akisDiyagrami(model, { gorunurluk: bireysel });
  expect(d.baslangic).toEqual({ girisVar: true, kip: 'ortam', profil: null, metin: 'Giriş (ortam tarifi), ekran açılır', sonuc: null });
  expect(d.adimlar.map((a) => [a.no, a.baslik, a.kosulur, a.hedef])).toEqual([[1, 'Bilgiler', true, null], [2, 'Ek adım', false, null], [3, 'Onay', true, 'basari']]);
  const [bilgi, ek, onay] = d.adimlar;
  // Düğmeler alan listesinde yok (ilerleme olarak bağlantıda); koşul metni modelin açıklaması ya da ifadenin okunuşu.
  expect(bilgi.alanlar).toEqual([
    { id: 'tip', etiket: 'Müşteri tipi', kosul: null, buSenaryoda: true, zorunlu: false },
    { id: 'vkn', etiket: 'Vergi no', kosul: 'Müşteri tipi = Kurumsal', buSenaryoda: false, zorunlu: false },
    { id: 'not', etiket: 'Not', kosul: 'Şubeye göre görünür', buSenaryoda: true, zorunlu: false },
    { id: 'eposta', etiket: 'E-posta', kosul: 'Müşteri tipi = Bireysel ya da Kurumsal', buSenaryoda: true, zorunlu: false }
  ]);
  expect(bilgi.ilerleme).toEqual(['Devam']);
  expect(ek).toMatchObject({ istegeBagli: true, kapsamEtiketi: 'Ek adım dahil' });
  expect(onay.ilerleme).toEqual(['Kaydet']);
  expect(d.bitis).toEqual({ tur: 'basari', metin: '“Kaydedildi” metni görünür', durum: null });
  expect(d.adimlar.every((a) => a.sonuc === null)).toBe(true);
  expect(d.eslesmeyenler).toEqual([]);
  // Görünürlük verilmezse her şey koşulur; girişsiz modelde başlangıç yalnız ekranı açar.
  const g = akisDiyagrami({ ...model, girisGerekmez: true });
  expect(g.adimlar.map((a) => a.kosulur)).toEqual([true, true, true]);
  expect(g.baslangic.metin).toBe('Girişsiz: ekran açılır (ekran giriş gerektirmez)');
  // Girişsiz model senaryonun seçimini ezer; senaryo seçimi (temiz oturum + profil / girişsiz) başlangıçta okunur.
  expect(akisDiyagrami({ ...model, girisGerekmez: true }, { giris: { kip: 'temiz', profil: 'Onaycı' } }).baslangic).toMatchObject({ girisVar: false, kip: 'girissiz', profil: null });
  expect(akisDiyagrami(model, { giris: { kip: 'temiz', profil: 'Onaycı' } }).baslangic).toMatchObject({ girisVar: true, kip: 'temiz', profil: 'Onaycı', metin: 'Giriş (ortam tarifi; Onaycı profili, temiz oturum), ekran açılır' });
  expect(akisDiyagrami(model, { giris: { kip: 'girissiz', profil: null } }).baslangic.metin).toBe('Girişsiz: ekran açılır (senaryo girişsiz)');
  // Yeniden giriş adımı diyagramda okunur (alan yok).
  const yg = akisDiyagrami({ ...model, adimlar: [...model.adimlar, { id: 'tekrar', sira: 4, baslik: 'Onaycı girer', yenidenGiris: { profil: 'Onaycı' } }] });
  expect(yg.adimlar[3]).toMatchObject({ baslik: 'Onaycı girer', yenidenGiris: { profil: 'Onaycı' }, alanlar: [] });
});

test('son koşu: adım sonuçları başlıkla eşlenir; kalan adım kırmızı, koşulmayan gri, kapsam dışı boş; eşleşmeyenler bildirilir', () => {
  const d = akisDiyagrami(model, {
    gorunurluk: bireysel,
    sonuc: {
      durum: 'basarisiz',
      adimlar: [
        { ad: 'Sisteme giriş yapılır', durum: 'basarili', sureMs: 900 },
        { ad: `${BAGLAM_ADIMI_ONEKI} (Merkez)`, durum: 'basarili' },
        { ad: 'Ekran açılır', durum: 'basarili' },
        { ad: 'Bilgiler', durum: 'basarili', sureMs: 1200 },
        { ad: 'Eski adım', durum: 'basarili' },
        { ad: 'Onay', durum: 'basarisiz', hataMesaji: 'Beklenen metin görünmedi\nayrıntı' }
      ]
    }
  });
  expect(d.baslangic.sonuc).toEqual({ durum: 'basarili', sureMs: null, hataMesaji: null });
  expect(d.adimlar.map((a) => a.sonuc && a.sonuc.durum)).toEqual(['basarili', null, 'basarisiz']);
  expect(d.adimlar[0].sonuc).toEqual({ durum: 'basarili', sureMs: 1200, hataMesaji: null });
  expect(d.adimlar[2].sonuc?.hataMesaji).toBe('Beklenen metin görünmedi\nayrıntı');
  expect(d.bitis.durum).toBe('basarisiz');
  expect(d.eslesmeyenler).toEqual(['Eski adım']);

  // Giriş kaldıysa ekran adımları "koşulmadı" olur; başlangıç kırmızı ve hatası görünür.
  const k = akisDiyagrami(model, { gorunurluk: bireysel, sonuc: { durum: 'basarisiz', adimlar: [{ ad: 'Sisteme giriş yapılır', durum: 'basarisiz', hataMesaji: 'Parola hatalı' }] } });
  expect(k.baslangic.sonuc).toEqual({ durum: 'basarisiz', sureMs: null, hataMesaji: 'Parola hatalı' });
  expect(k.adimlar.map((a) => a.sonuc && a.sonuc.durum)).toEqual(['kosulmadi', null, 'kosulmadi']);
});

test('beklenen iş kuralı hatası: hedef adım işaretlenir, sonraki adımlar bu senaryoda koşulmaz, bitiş beklenen mesajı gösterir', () => {
  const d = akisDiyagrami(model, { gorunurluk: { ...bireysel, adimlar: { bilgi: true, ek: true, onay: true } }, beklenen: { hataAdimi: 'bilgi', mesaj: 'Vergi no hatalı' } });
  expect(d.adimlar.map((a) => [a.id, a.kosulur, a.hedef])).toEqual([['bilgi', true, 'hata'], ['ek', false, null], ['onay', false, null]]);
  expect(d.bitis).toEqual({ tur: 'hata', metin: 'İş kuralı hatası beklenir: “Vergi no hatalı”', durum: null });
});

test('koşul ifadelerinin okunuşu (ve / ya da / değil, onay kutusu, senaryo ayarı, çalışma anı)', () => {
  const m = {
    adimlar: [{ id: 'a', bolumler: [{ id: 'b', alanlar: [
      { id: 'tip', tip: 'secim', etiket: { form: 'Tip' }, secenekler: [{ deger: 'x', senaryoDegeri: 'X1', metin: 'İks' }] },
      { id: 'onay', tip: 'onayKutusu', etiket: { ekran: 'Sözleşme' } }
    ] }] }],
    senaryoDuzeyi: { alanlar: [{ id: 'odemeDahil', tip: 'onayKutusu', etiket: { form: 'Ödeme dahil' } }] }
  };
  expect(ifadeMetni({ ve: [{ alan: 'tip', esit: 'X1' }, { alan: 'onay', esit: true }] }, m)).toBe('Tip = İks ve Sözleşme işaretli');
  expect(ifadeMetni({ veya: [{ senaryoAyari: 'odemeDahil', esit: false }, { calismaZamani: 'gorunurse' }] }, m)).toBe('Ödeme dahil işaretsiz ya da ekranda görünürse');
  expect(ifadeMetni({ degil: { alan: 'bilinmeyen', esit: 'v' } }, m)).toBe('bilinmeyen = v değilse');
  expect(ifadeMetni({ sube: { alanSeti: 'x' } }, m)).toBe('koşullu');
});

test('başlangıç adımı başlıkları model koşucusunun test.step başlıklarıyla aynı', () => {
  const kosucu = readFileSync(join(__dirname, '..', 'support', 'model-kosucu.ts'), 'utf8');
  for (const ad of BASLANGIC_ADIMLARI) expect(kosucu).toContain(`test.step('${ad}'`);
  expect(kosucu).toContain(`test.step(\`${BAGLAM_ADIMI_ONEKI} (`);
  expect(kosucu).toContain('await test.step(adim.baslik,');
});
