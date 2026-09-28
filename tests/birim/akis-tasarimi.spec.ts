// Akış tasarımı (topla → tasarla; saf): kayıttaki olay sırasından taslak diyagram, blok doğrulaması ve blokların adım
// biçimindeki kayıt envanterine / ekran paketine çevrilmesi (isteğe bağlı aksiyon, beklenen mesajlar, seçime göre görünürlük).
import { expect, test } from '@playwright/test';
import { akisPaleti, akisTaslagi, akistanKayitEnvanteri, bloklariAyikla } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import type { AkisBlogu, AkisEnvanteri, AkisOkumasi } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { adimlardanBloklar, akisDuzenlenebilirMi, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { akisDiyagrami } from '../../scripts/platform/senaryolar/akis-diyagrami.mjs';
import { formDegerleriniKur, formSemasiOlustur, senaryoNesnesiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';

type Nesne = Record<string, any>;
const alan = (anahtar: string, etiket: string, tur = 'text', ek: Partial<HamAlan> = {}): HamAlan => ({
  anahtar, tur, etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Müşteri' }, ...ek
});
const TIP = alan('@tip', 'Müşteri tipi', 'radio', { secici: 'input[name="tip"]', radyolar: [{ deger: 'b', metin: 'Bireysel', secici: null }, { deger: 'k', metin: 'Kurumsal', secici: null }] });
const TESLIMAT = alan('#teslimat', 'Teslimat', 'select', { secenekler: [{ deger: '', metin: 'Seçiniz' }, { deger: 'dar', metin: 'Dar' }, { deger: 'genis', metin: 'Geniş' }], bolum: { anahtar: 't', baslik: 'Teslimat' } });
const ALANLAR = [alan('#ad', 'Ad Soyad'), TIP, alan('#tc', 'TC kimlik no'), alan('#arama', 'Site içi arama'), alan('#vkn', 'Vergi kimlik no'),
  alan('#ekAd', 'Ek adres adı'), TESLIMAT, alan('#hediyeNotu', 'Hediye notu', 'checkbox', { bolum: { anahtar: 't', baslik: 'Teslimat' } })];
const oku = (gorunen: string[], dokunulan: string[] = [], secimler: Record<string, string> = {}): AkisOkumasi => ({ yol: '/siparis/', gorunen, dokunulan, secimler });
const MUSTERI = ['#ad', '@tip', '#arama'];

/** Bireysel alanları doldur → yeniden oku → Kurumsal seç → "Ek adres ekle" → ek adres adı → Devam → teslimat dar/geniş → Kaydet → mesaj. */
function envanter(): AkisEnvanteri {
  return {
    kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Açık siparis',
    alanlar: ALANLAR.map((a) => ({ alan: a, secili: a.anahtar !== '#arama' })),
    dugmeler: [{ secici: '#ekAdresEkle', metin: 'Ek adres ekle' }, { secici: '#devam', metin: 'Devam' }, { secici: '#kaydet', metin: 'Siparisi kaydet' }],
    mesajlar: [{ secici: '#sonuc', metin: 'Siparis oluşturuldu. No: SP-1001' }],
    olaylar: [
      { tur: 'okuma', elle: false, okuma: oku([...MUSTERI, '#tc'], [], { '@tip': 'b' }) },
      { tur: 'okuma', elle: true, okuma: oku([...MUSTERI, '#tc'], ['#ad', '#tc'], { '@tip': 'b' }) },
      { tur: 'okuma', elle: false, okuma: oku([...MUSTERI, '#vkn'], ['#ad', '@tip'], { '@tip': 'k' }) },
      { tur: 'tik', dugme: 0, oncesi: oku([...MUSTERI, '#vkn'], ['#ad', '@tip', '#vkn'], { '@tip': 'k' }) },
      { tur: 'okuma', elle: false, okuma: oku([...MUSTERI, '#vkn', '#ekAd'], [], { '@tip': 'k' }) },
      { tur: 'tik', dugme: 1, oncesi: oku([...MUSTERI, '#vkn', '#ekAd'], ['#ekAd'], { '@tip': 'k' }) },
      // Teslimat henüz seçilmemişken okundu ("Seçiniz"): koşul çıkarımında yok sayılır.
      { tur: 'okuma', elle: false, okuma: oku(['#teslimat', '#arama'], [], {}) },
      { tur: 'okuma', elle: false, okuma: oku(['#teslimat', '#arama'], ['#teslimat'], { '#teslimat': 'dar' }) },
      { tur: 'okuma', elle: false, okuma: oku(['#teslimat', '#hediyeNotu', '#arama'], ['#teslimat'], { '#teslimat': 'genis' }) },
      { tur: 'tik', dugme: 2, oncesi: oku(['#teslimat', '#hediyeNotu', '#arama'], ['#teslimat', '#hediyeNotu'], { '#teslimat': 'genis' }) },
      { tur: 'mesaj', mesaj: 0 }
    ],
    engellenenler: [], notlar: []
  };
}
const META = { ekranAnahtari: 'siparis', ekranAdi: 'Siparis', urlYolu: '/siparis/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };

test('taslak: her düğme basışı bir aksiyon, aradaki dokunulan (listede işaretli) alanlar bir grup, seçilen mesaj; sonunda Bitir', () => {
  const t = akisTaslagi(envanter());
  expect(t).toEqual([
    // Seçime göre görünürlük taslakta hazır: T.C. Bireysel'de, VKN Kurumsal'da (koşul düzenleyicisinde görünür, düzeltilebilir).
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad', '@tip', '#tc', '#vkn'], zorunlu: [], kosullar: { '#ad': null, '@tip': null, '#tc': { secim: '@tip', degerler: ['b'] }, '#vkn': { secim: '@tip', degerler: ['k'] } } },
    { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'alanlar', ad: 'Müşteri (2)', alanlar: ['#ekAd'], zorunlu: [], kosullar: { '#ekAd': null } },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'alanlar', ad: 'Teslimat', alanlar: ['#teslimat', '#hediyeNotu'], zorunlu: [], kosullar: { '#teslimat': null, '#hediyeNotu': { secim: '#teslimat', degerler: ['genis'] } } },
    { tur: 'aksiyon', dugme: 2, istegeBagli: false },
    // Mesajın değişken numarası atılır (öneri; kullanıcı değiştirebilir).
    { tur: 'mesaj', mesaj: 0, metin: 'Siparis oluşturuldu. No' },
    { tur: 'bitir' }
  ]);
  // Listeye alınmamış alan (site içi arama) taslağa girmez; sağ listede görünür ama kullanılmamış.
  const p = akisPaleti(envanter(), t);
  expect(p.alanlar.find((a) => a.anahtar === '#arama')).toMatchObject({ secili: false, blok: null });
  expect(p.alanlar.find((a) => a.anahtar === '#vkn')).toMatchObject({ secili: true, blok: 0, etiket: 'Vergi kimlik no' });
  expect(p.dugmeler.map((d) => [d.metin, d.blok])).toEqual([['Ek adres ekle', 1], ['Devam', 3], ['Siparisi kaydet', 5]]);
  expect(p.mesajlar).toEqual([{ sira: 0, metin: 'Siparis oluşturuldu. No: SP-1001', oneri: 'Siparis oluşturuldu. No', blok: 6 }]);
  expect(JSON.stringify(p)).not.toContain('#ekAdresEkle'); // seçiciler arayüze gitmez
});

test('tasarlanan akış: isteğe bağlı aksiyon + açtığı alanlar alt adım, ilerleme ayrı adım, seçime göre görünürlük, beklenen mesaj', () => {
  const env = envanter();
  const bloklar: AkisBlogu[] = [
    { tur: 'alanlar', ad: 'Müşteri bilgileri', alanlar: ['#ad', '@tip', '#tc', '#vkn'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 0, istegeBagli: true },
    { tur: 'alanlar', ad: 'Ek adres', alanlar: ['#ekAd'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'alanlar', ad: 'Teslimat', alanlar: ['#teslimat', '#hediyeNotu'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 2, istegeBagli: false },
    { tur: 'mesaj', mesaj: 0, metin: 'Siparis oluşturuldu' },
    { tur: 'bitir' }
  ];
  const { envanter: k, hatalar } = akistanKayitEnvanteri(env, bloklar);
  expect(hatalar).toEqual([]);
  expect(k?.adimlar.map((a) => [a.ad, a.alanlar.map((x) => x.anahtar), a.parcalar ?? null, a.ilerleme?.metin ?? null])).toEqual([
    ['Müşteri bilgileri', ['#ad', '@tip', '#tc', '#vkn', '#ekAd'], [0, 0, 0, 0, 1], 'Devam'],
    ['Teslimat', ['#teslimat', '#hediyeNotu'], null, 'Siparisi kaydet']
  ]);
  expect(k?.adimlar[0].acicilar).toEqual([{ secici: '#ekAdresEkle', metin: 'Ek adres ekle', secimli: true }]);
  expect(k?.basariGostergesi).toEqual({ secici: '#sonuc', metin: 'Siparis oluşturuldu. No: SP-1001', aranan: 'Siparis oluşturuldu' });
  // Başka ekrandaki okumalar (teslimat sayfası) müşteri adımının okumalarına girmez.
  expect(k?.adimlar[0].okumalar?.length).toBe(6);
  expect(k?.adimlar[1].okumalar?.length).toBe(4);

  const m = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => a.baslik)).toEqual(['Müşteri bilgileri', 'Müşteri bilgileri: Ek adres ekle', 'Müşteri bilgileri: Ek adres ekle sonrası', 'Müşteri bilgileri: Devam', 'Teslimat']);
  const alanId = (secici: string): string => m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar)).find((x: Nesne) => x.konum.secici === secici).id;
  const gorunurluk = (secici: string): unknown => {
    const a = m.adimlar.flatMap((x: Nesne) => x.bolumler.flatMap((b: Nesne) => b.alanlar)).find((x: Nesne) => x.konum.secici === secici);
    return a.gorunurluk ? m.kosullar[a.gorunurluk.kosul].ifade : null;
  };
  expect(gorunurluk('#tc')).toEqual({ alan: alanId('input[name="tip"]'), esit: 'b' });
  expect(gorunurluk('#vkn')).toEqual({ alan: alanId('input[name="tip"]'), esit: 'k' });
  expect(gorunurluk('#ekAd')).toBeNull();
  // "Seçiniz" iken alınan okuma yok sayıldı: hediye notu "Geniş"te görünür.
  expect(gorunurluk('#hediyeNotu')).toEqual({ alan: alanId('#teslimat'), esit: 'genis' });
  expect(m.adimlar[4].kosu).toEqual({ aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Siparisi kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Siparis oluşturuldu', secici: '#sonuc' } });
  expect(m.senaryoDuzeyi.alanlar).toEqual([expect.objectContaining({ tip: 'onayKutusu', etiket: { ekran: null, form: '“Ek adres ekle” dahil' } })]);
});

test('ara mesaj düğmeden sonra beklenir; elle yazılan mesaj (öğesiz) sayfada aranır; alansız adım boş grupla adlandırılır', () => {
  const env = envanter();
  const { envanter: k, hatalar } = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'mesaj', mesaj: null, metin: 'Müşteri kaydedildi' },
    { tur: 'alanlar', ad: 'Onay', alanlar: [], zorunlu: [] },
    { tur: 'aksiyon', dugme: 2, istegeBagli: false },
    { tur: 'mesaj', mesaj: null, metin: 'Siparis oluşturuldu' },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  expect(k?.adimlar.map((a) => [a.ad, a.alanlar.length, a.gosterge ?? null])).toEqual([
    ['Müşteri', 1, { secici: null, metin: 'Müşteri kaydedildi', aranan: 'Müşteri kaydedildi' }], ['Onay', 0, null]
  ]);
  const m = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => [a.baslik, a.kosu])).toEqual([
    ['Müşteri', { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'metin', deger: 'Müşteri kaydedildi' } }],
    ['Onay', { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Siparisi kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Siparis oluşturuldu' } }]
  ]);
  // Öğe seçilmediği için "sonuç mesajı" çıktısı modele eklenmez.
  expect(JSON.stringify(m)).not.toContain('"cikti"');
});

test('VEYA: art arda beklenen mesajlar bir grup (herhangi biri başarı); ara ve son adımda, en çok 5; modelden bloklara geri döner', () => {
  const env = envanter();
  const { envanter: k, hatalar } = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'mesaj', mesaj: null, metin: 'Müşteri kaydedildi' },
    { tur: 'mesaj', mesaj: null, metin: 'Müşteri güncellendi' },
    { tur: 'alanlar', ad: 'Onay', alanlar: [], zorunlu: [] },
    { tur: 'aksiyon', dugme: 2, istegeBagli: false },
    { tur: 'mesaj', mesaj: 0, metin: 'Siparis oluşturuldu' },
    { tur: 'mesaj', mesaj: null, metin: 'Siparis kaydedildi' },
    { tur: 'mesaj', mesaj: null, metin: 'Başvuru hazır' },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const paket = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket;
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const m = paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => a.kosu.basariGostergesi)).toEqual([
    { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Müşteri kaydedildi' }, { tur: 'metin', deger: 'Müşteri güncellendi' }] },
    { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Siparis oluşturuldu', secici: '#sonuc' }, { tur: 'metin', deger: 'Siparis kaydedildi' }, { tur: 'metin', deger: 'Başvuru hazır' }] }
  ]);
  // Modelden tasarıma geri: her seçenek ardışık bir mesaj bloğu.
  const geri = adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m));
  expect(geri.filter((b) => b.tur === 'mesaj').map((b) => (b as Nesne).metin)).toEqual(['Müşteri kaydedildi', 'Müşteri güncellendi', 'Siparis oluşturuldu', 'Siparis kaydedildi', 'Başvuru hazır']);
  expect(geri.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'mesaj', 'mesaj', 'alanlar', 'aksiyon', 'mesaj', 'mesaj', 'mesaj', 'bitir']);
  // Diyagramda "VEYA" ile okunur.
  expect(JSON.stringify(akisDiyagrami(m))).toContain('“Müşteri kaydedildi” metni görünür VEYA “Müşteri güncellendi” metni görünür');
  // En çok 5; aynı aksiyondan sonra araya başka blok girince ikinci grup olmaz.
  const mesaj = (metin: string): AkisBlogu => ({ tur: 'mesaj', mesaj: null, metin });
  expect(akistanKayitEnvanteri(env, [{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [] }, { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    ...['1', '2', '3', '4', '5', '6'].map(mesaj), { tur: 'bitir' }]).hatalar).toEqual([{ blok: 7, mesaj: 'Art arda en fazla 5 başarı mesajı (VEYA) olabilir.' }]);
  expect(akistanKayitEnvanteri(env, [{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [] }, { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    mesaj('x'), { tur: 'bekle', saniye: 2 }, mesaj('y'), { tur: 'alanlar', ad: 'B', alanlar: ['#tc'], zorunlu: [] }, { tur: 'bitir' }]).hatalar)
    .toEqual([{ blok: 4, mesaj: 'Aynı aksiyondan sonra birden çok beklenen mesaj için mesajları art arda koyun (VEYA).' }]);
});

test('Başarı / Uyarı: uyarılar adımın kabul edilen uyarıları (VEYA grubuna girmez), beklenen sonuç alanı eklenir; senaryo uyarılardan seçer', () => {
  const env = envanter();
  const { envanter: k, hatalar } = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'mesaj', mesaj: null, metin: 'Müşteri kaydedildi' },
    { tur: 'mesaj', mesaj: null, metin: 'Kara listede', uyari: true },
    { tur: 'mesaj', mesaj: null, metin: 'Müşteri güncellendi' },
    { tur: 'alanlar', ad: 'Onay', alanlar: [], zorunlu: [] },
    { tur: 'aksiyon', dugme: 2, istegeBagli: false },
    { tur: 'mesaj', mesaj: 0, metin: 'Siparis oluşturuldu' },
    { tur: 'mesaj', mesaj: null, metin: 'Limit aşıldı', uyari: true },
    { tur: 'mesaj', mesaj: null, metin: 'Onay gerekiyor', uyari: true },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const paket = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket;
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const m = paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => [a.kosu.basariGostergesi, a.kosu.uyarilar])).toEqual([
    [{ tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Müşteri kaydedildi' }, { tur: 'metin', deger: 'Müşteri güncellendi' }] }, [{ metin: 'Kara listede' }]],
    [{ tur: 'metin', deger: 'Siparis oluşturuldu', secici: '#sonuc' }, [{ metin: 'Limit aşıldı' }, { metin: 'Onay gerekiyor' }]]
  ]);
  // Senaryo düzeyinde "Beklenen sonuç": uyarının beklendiği adım seçenekleri uyarılı adımlar.
  const bs = (m.senaryoDuzeyi.alanlar as Nesne[]).find((a) => a.tip === 'birlesim') as Nesne;
  expect(bs.varyantlar[1].alanlar.adim.secenekler.map((s: Nesne) => s.metin)).toEqual(['Müşteri', 'Onay']);
  // Tasarıma geri: uyarılar "Uyarı" işaretli bloklar.
  const geri = adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m));
  expect(geri.filter((b) => b.tur === 'mesaj').map((b) => [(b as Nesne).metin, (b as Nesne).uyari ?? false])).toEqual([
    ['Müşteri kaydedildi', false], ['Müşteri güncellendi', false], ['Kara listede', true], ['Siparis oluşturuldu', false], ['Limit aşıldı', true], ['Onay gerekiyor', true]
  ]);
  // Form: akışın uyarıları ve başarı mesajları; iki uyarı seçilince senaryoda mesajlar (VEYA), plan ikisini de bekler.
  const sema = formSemasiOlustur(m, {});
  expect(sema.beklenenSonuc?.uyarilar.map((u) => [u.adimBasligi, u.metin])).toEqual([['Müşteri', 'Kara listede'], ['Onay', 'Limit aşıldı'], ['Onay', 'Onay gerekiyor']]);
  expect(sema.beklenenSonuc?.basariMesajlari).toEqual(['Siparis oluşturuldu']);
  const onayId = String(m.adimlar[1].id);
  const d = formDegerleriniKur(sema, {});
  Object.assign(d, { [`${bs.id}.tip`]: 'isKuraliHatasi', [`${bs.id}.adim`]: onayId, [`${bs.id}.mesaj`]: 'Limit aşıldı', [`${bs.id}.mesajlar`]: ['Limit aşıldı', 'Onay gerekiyor'], baslik: 'x' });
  const senaryo = senaryoNesnesiOlustur(sema, d);
  expect(senaryo.beklenenSonuc).toEqual({ tip: 'isKuraliHatasi', adim: onayId, mesaj: 'Limit aşıldı', mesajlar: ['Limit aşıldı', 'Onay gerekiyor'] });
  expect(modelKosuPlani(m, senaryo).beklenen).toEqual({ tur: 'hata', adim: onayId, mesaj: 'Limit aşıldı', mesajlar: ['Limit aşıldı', 'Onay gerekiyor'] });
  // Eski biçim (tek mesaj) aynen: mesajlar = [mesaj].
  expect(modelKosuPlani(m, { beklenenSonuc: { tip: 'isKuraliHatasi', adim: onayId, mesaj: 'elle yazılan' } }).beklenen).toMatchObject({ mesajlar: ['elle yazılan'] });
});

test('çoklu akış: bir akış yeniden kaydedilince DİĞER akışın alanlarına bağlı koşullar ve iş kuralları silinmez', () => {
  const env = envanter();
  const ilk = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad', '@tip'], zorunlu: [] }, { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'mesaj', mesaj: null, metin: 'Tamam' }, { tur: 'bitir' }
  ]).envanter as NonNullable<ReturnType<typeof akistanKayitEnvanteri>['envanter']>;
  const model = kayitPaketiOlustur(META, ilk).paket.model as Nesne;
  // İkinci akış: yalnız o akışta olan bir alan (#vkn) ve ona bağlı koşul + iş kuralı.
  const vkn = { id: 'vkn', tip: 'metin', etiket: { ekran: 'VKN' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'vkn' }, konum: { secici: '#vkn', kirilganlik: 'orta' } };
  const not = { id: 'notAlani', tip: 'metin', etiket: { ekran: 'Not' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'notAlani' }, konum: { secici: '#not', kirilganlik: 'orta' }, gorunurluk: { kosul: 'vknVar' } };
  model.kosullar.vknVar = { aciklama: 'x', ifade: { alan: 'vkn', esit: '1' } };
  model.isKurallari = [{ id: 'k1', adim: 'kurumsalAdim', kosul: { alan: 'vkn', esit: '2' }, mesaj: 'm', kaynak: 'test' }];
  model.akislar = [{ id: 'ana', ad: 'Ana akış', varsayilan: true, adimlar: model.adimlar },
    { id: 'kurumsal', ad: 'Kurumsal', adimlar: [{ id: 'kurumsalAdim', sira: 1, baslik: 'Kurumsal', bolumler: [{ id: 'k', baslik: 'K', alanlar: [vkn, not] }] }] }];
  // Varsayılan akış yeniden kaydedilir (Akışı kaydet > şu akışı güncelle).
  const yeni = kayitPaketiOlustur({ ...META, mevcutModel: model }, ilk).paket.model as Nesne;
  expect(yeni.kosullar.vknVar).toEqual(model.kosullar.vknVar);
  expect(yeni.isKurallari).toEqual(model.isKurallari);
  expect((yeni.akislar as Nesne[]).find((a) => a.id === 'kurumsal')?.adimlar[0].bolumler[0].alanlar[1].gorunurluk).toEqual({ kosul: 'vknVar' });
});

test('akış düzenleyici: diyagramın gösteremediği adım özellikleri varsa akış düzenlenemez (kaydedince kaybolmasın)', () => {
  const env = envanter();
  const k = akistanKayitEnvanteri(env, [{ tur: 'alanlar', ad: 'Müşteri', alanlar: ['#ad'], zorunlu: [] }, { tur: 'aksiyon', dugme: 1, istegeBagli: false }, { tur: 'bitir' }]).envanter;
  const model = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket.model as Nesne;
  expect(akisDuzenlenebilirMi(model)).toEqual({ duzenlenebilir: true, neden: null });
  const bozuk = (d: (m: Nesne) => void) => { const m = JSON.parse(JSON.stringify(model)) as Nesne; d(m); return akisDuzenlenebilirMi(m); };
  expect(bozuk((m) => { m.adimlar[0].kosu.aksiyonlar[0].metin = 'Devam'; }).neden).toContain('metinle süzülen düğme tıklaması');
  expect(bozuk((m) => { m.adimlar[0].kosu.basariGostergesi = { tur: 'url', deger: '/tamam' }; }).neden).toContain('adres (url)');
  // Hata göstergesi (uyarısız) kaydederken adımdan korunur; ortak akış da düzenlenebilir.
  expect(bozuk((m) => { m.adimlar[0].kosu.hataGostergesi = { secici: '#hata' }; }).duzenlenebilir).toBe(true);
  expect(bozuk((m) => { m.tur = 'ortakAkis'; }).duzenlenebilir).toBe(true);
});

test('doğrulama: Bitir zorunlu ve sonda; boş/tekrarlı grup, aynı alan iki grupta, düğmesiz aksiyon, yersiz mesaj — bloğun sırasıyla', () => {
  const env = envanter();
  const hatalari = (b: AkisBlogu[]) => akistanKayitEnvanteri(env, b).hatalar;
  expect(hatalari([{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [] }])).toEqual([{ blok: null, mesaj: 'Akış “Bitir” bloğuyla bitmeli.' }]);
  expect(hatalari([{ tur: 'bitir' }, { tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [] }]).map((h) => h.blok)).toEqual([0, null]);
  expect(hatalari([
    { tur: 'alanlar', ad: '', alanlar: [], zorunlu: [] },
    { tur: 'alanlar', ad: 'A', alanlar: ['#ad', '#tc'], zorunlu: [] },
    { tur: 'alanlar', ad: 'A', alanlar: ['#tc', '#yok'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 9, istegeBagli: false },
    { tur: 'aksiyon', dugme: 0, istegeBagli: true },
    { tur: 'mesaj', mesaj: null, metin: 'x' },
    { tur: 'mesaj', mesaj: null, metin: '' },
    { tur: 'bitir' }
  ])).toEqual([
    { blok: 0, mesaj: 'Alan grubunun adını yazın.' },
    { blok: 0, mesaj: 'Alan grubu boş: alan ekleyin (alansız bir adımı adlandırmak için ardından bir aksiyon gelmeli).' },
    { blok: 2, mesaj: '“A” adı başka bir alan grubunda da var; adlar tekil olmalı.' },
    { blok: 2, mesaj: '“TC kimlik no” alanı birden çok grupta; bir alan yalnızca bir grupta olabilir.' },
    { blok: 2, mesaj: 'Kayıtta olmayan bir alan seçilmiş.' },
    { blok: 3, mesaj: 'Aksiyonun düğmesini seçin.' },
    { blok: 5, mesaj: 'Beklenen mesaj isteğe bağlı bir aksiyondan hemen sonra gelemez (her senaryoda görünmez).' },
    { blok: 6, mesaj: 'Beklenen mesajın aranacak metnini yazın.' }
  ]);
  // Mesaj, düğmeye basılmadan (alan grubundan hemen sonra, son değilse) beklenemez.
  expect(hatalari([{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [] }, { tur: 'mesaj', mesaj: null, metin: 'x' }, { tur: 'aksiyon', dugme: 1, istegeBagli: false }, { tur: 'bitir' }]))
    .toEqual([{ blok: 1, mesaj: 'Beklenen mesaj bir aksiyondan (düğmeye basma) sonra gelmeli.' }]);
  // Biçim ayıklama: bilinmeyen tür ve bozuk blok hatadır; alanlar/uzunluklar süzülür.
  expect(bloklariAyikla([{ tur: 'x' }, 5, { tur: 'alanlar', ad: '  A  ', alanlar: ['#ad', 3], fazla: 1 }])).toEqual({
    bloklar: [{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [], kosullar: {} }],
    hatalar: [{ blok: 0, mesaj: 'Bilinmeyen blok türü.' }, { blok: 1, mesaj: 'Blok okunamadı.' }]
  });
});

test('bekleme süresi düğmeden sonra (isteğe bağlı düğmede yalnız o düğmeyle), düğmesiz adımda alanlardan sonra; zorunlu alan koşuda görünmeli', () => {
  const env = envanter();
  const { envanter: k, hatalar } = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Müşteri bilgileri', alanlar: ['#ad', '@tip', '#tc', '#vkn'], zorunlu: ['#ad', '#vkn'] },
    { tur: 'bekle', saniye: 2 },
    { tur: 'aksiyon', dugme: 0, istegeBagli: true },
    { tur: 'bekle', saniye: 1 },
    { tur: 'alanlar', ad: 'Ek adres', alanlar: ['#ekAd'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 1, istegeBagli: false },
    { tur: 'bekle', saniye: 3 },
    { tur: 'bekle', saniye: 2 },
    { tur: 'alanlar', ad: 'Teslimat', alanlar: ['#teslimat'], zorunlu: ['#teslimat'] },
    { tur: 'bekle', saniye: 4 },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const m = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => [a.baslik, a.kosu?.aksiyonlar ?? null])).toEqual([
    ['Müşteri bilgileri', null],
    ['Müşteri bilgileri: Ek adres ekle', [{ tur: 'bekle', sureSn: 2 }, { tur: 'tikla', secici: '#ekAdresEkle', aciklama: 'Ek adres ekle' }, { tur: 'bekle', sureSn: 1 }]],
    ['Müşteri bilgileri: Ek adres ekle sonrası', null],
    ['Müşteri bilgileri: Devam', [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }, { tur: 'bekle', sureSn: 5 }]],
    ['Teslimat', [{ tur: 'bekle', sureSn: 4 }]]
  ]);
  const alanlar = m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar)).filter((x: Nesne) => x.yapilandirma === 'senaryo');
  expect(alanlar.map((x: Nesne) => [x.konum.secici, x.zorunlu, x.mutlakaGorunmeli ?? false])).toEqual([
    ['#ad', true, true], ['input[name="tip"]', false, false], ['#tc', false, false], ['#vkn', true, true], ['#ekAd', false, false], ['#teslimat', true, true]
  ]);
  // Hatalı bekleme: süre sınırı ve yer.
  expect(akistanKayitEnvanteri(env, [{ tur: 'bekle', saniye: 5 }, { tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: [] }, { tur: 'bekle', saniye: 0 }, { tur: 'bitir' }]).hatalar).toEqual([
    { blok: 0, mesaj: 'Bekleme bir alan grubundan ya da aksiyondan sonra gelmeli.' },
    { blok: 2, mesaj: 'Bekleme süresi 1–120 saniye arasında tam sayı olmalı.' }
  ]);
  // Ayıklama: zorunlu yalnızca gruptaki alanlardan; bekleme süresi tam sayı değilse -1 (doğrulamada hata).
  expect(bloklariAyikla([{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: ['#ad', '#tc'] }, { tur: 'bekle', saniye: '3' }]).bloklar)
    .toEqual([{ tur: 'alanlar', ad: 'A', alanlar: ['#ad'], zorunlu: ['#ad'], kosullar: {} }, { tur: 'bekle', saniye: -1 }]);
});

test('elle koşul: otomatik bulunanın yerine geçer, null koşulsuz yapar; seçim alanı akışta ve seçenekler geçerli olmalı', () => {
  const env = envanter();
  const t = akisTaslagi(env);
  const musteri = t[0] as Extract<AkisBlogu, { tur: 'alanlar' }>;
  // Kullanıcı: T.C. koşulunu kaldırır (her zaman görünür), VKN'yi Bireysel ya da Kurumsal'a bağlar.
  const bloklar: AkisBlogu[] = [{ ...musteri, kosullar: { ...musteri.kosullar, '#tc': null, '#vkn': { secim: '@tip', degerler: ['b', 'k'] } } }, ...t.slice(1)];
  const { envanter: k, hatalar } = akistanKayitEnvanteri(env, bloklar);
  expect(hatalar).toEqual([]);
  const m = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket.model as Nesne;
  const alanlar = m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar));
  const bul = (s: string): Nesne => alanlar.find((x: Nesne) => x.konum.secici === s);
  expect(bul('#tc').gorunurluk).toBeUndefined();
  expect(m.kosullar[bul('#vkn').gorunurluk.kosul]).toMatchObject({ ifade: { alan: bul('input[name="tip"]').id, icinde: ['b', 'k'] }, aciklama: 'Müşteri tipi = Bireysel / Kurumsal seçilince görünür (akış tasarımı).' });
  // Otomatik olan (hediye notu → Geniş) korunur.
  expect(m.kosullar[bul('#hediyeNotu').gorunurluk.kosul].ifade).toEqual({ alan: bul('#teslimat').id, esit: 'genis' });
  // Hatalar: seçim alanı akışta değil / seçim alanı değil / geçersiz seçenek.
  const hatali = (kosul: { secim: string; degerler: string[] }) => akistanKayitEnvanteri(env, [{ tur: 'alanlar', ad: 'A', alanlar: ['#ad', '#tc'], zorunlu: [], kosullar: { '#tc': kosul } }, { tur: 'bitir' }]).hatalar;
  expect(hatali({ secim: '@tip', degerler: ['b'] })).toEqual([{ blok: 0, mesaj: '“TC kimlik no” alanının koşulundaki seçim alanı akışta yok; seçim alanını bir gruba ekleyin ya da koşulu kaldırın.' }]);
  expect(hatali({ secim: '#ad', degerler: ['x'] })).toEqual([{ blok: 0, mesaj: '“TC kimlik no” alanının koşulu bir seçim alanına (açılır liste / radyo) bağlanmalı.' }]);
  expect(akistanKayitEnvanteri(env, [{ tur: 'alanlar', ad: 'A', alanlar: ['@tip', '#tc'], zorunlu: [], kosullar: { '#tc': { secim: '@tip', degerler: ['z'] } } }, { tur: 'bitir' }]).hatalar)
    .toEqual([{ blok: 0, mesaj: '“TC kimlik no” alanının koşulunda “Müşteri tipi” için en az bir geçerli seçenek seçin.' }]);
  // Sağ liste seçim alanlarının seçeneklerini verir (koşul düzenleyicisi için).
  expect(akisPaleti(env, t).alanlar.find((a) => a.anahtar === '@tip')?.secenekler).toEqual([{ deger: 'b', metin: 'Bireysel' }, { deger: 'k', metin: 'Kurumsal' }]);
});

test('sıra: gruptaki alan sırası modelde doldurma sırasıdır (farklı bölümlerin alanları karışık sırada olsa da)', () => {
  const env = envanter();
  const k = akistanKayitEnvanteri(env, [
    { tur: 'alanlar', ad: 'Karışık', alanlar: ['#teslimat', '#ad', '#hediyeNotu'], zorunlu: [] }, { tur: 'aksiyon', dugme: 2, istegeBagli: false }, { tur: 'bitir' }
  ]);
  expect(k.hatalar).toEqual([]);
  const model = kayitPaketiOlustur(META, k.envanter as NonNullable<typeof k.envanter>).paket.model as Nesne;
  const sira = (model.adimlar[0].bolumler as Nesne[]).flatMap((b) => (b.alanlar as Nesne[]).filter((a) => a.tip !== 'buton' && a.tip !== 'cikti').map((a) => a.konum.secici));
  expect(sira).toEqual(['#teslimat', '#ad', '#hediyeNotu']);
  // Diyagrama geri: aynı sıra.
  const geri = adimlardanBloklar(model, model.adimlar as Nesne[], modeldenAkisEnvanteri(model));
  expect((geri.find((b) => b.tur === 'alanlar') as Nesne).alanlar).toEqual(['teslimat', 'ad', 'hediyeNotu']);
});
