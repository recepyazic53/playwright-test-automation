// KORUMA TESTLERİ — senaryo tasarım yardımcısının SAF öneri fonksiyonu (senaryo-onerileri.mjs; tarayıcı yok):
// zorunlu alan önerileri (beklenen sonuç yalnız modelde gösterge / kural varsa; yoksa "siz seçin"), sınır değerleri (yalnız modeldeki
// kurallardan; kural yoksa öneri yok + not), koşullu dallar, kombinasyonlar (+ üst sınır), kişisel / gizli alanda değer üretmeme,
// "mevcut" işareti; doğrulayıcının "bilerek boş" uyarısı ve koşucunun bu alana varsayılan yazmaması.
import { expect, test } from '@playwright/test';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { MESAJLAR, gorunurlukleriHesapla, senaryoyuDogrula, type DogrulamaModeli } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import {
  KOMBINASYON_UST_SINIRI, MASKE, senaryoOnerileri, type Oneri, type OneriGirdisi, type OneriSenaryosu
} from '../../scripts/platform/senaryolar/senaryo-onerileri.mjs';
import { TELEFON, siparisModeli, tabanVerisi } from './senaryo-onerileri-fikstur';

type Nesne = Record<string, any>;
const SIMDI = new Date(2026, 8, 28, 10, 0, 0);

function girdi(model: Nesne, senaryolar: OneriSenaryosu[], ek: Partial<OneriGirdisi> = {}): OneriGirdisi {
  const baglam = { model: model as DogrulamaModeli, altModeller: {}, kaynak: 'kayit' as const, simdi: SIMDI };
  return {
    model, sema: formSemasiOlustur(model, {}), senaryolar, simdi: SIMDI,
    gorunurlukHesapla: (veri) => gorunurlukleriHesapla(veri, baglam),
    dogrula: (veri) => senaryoyuDogrula(veri, baglam),
    ...ek
  };
}
const dogrula = (model: Nesne, veri: Nesne) => senaryoyuDogrula(veri, { model: model as DogrulamaModeli, altModeller: {}, kaynak: 'kayit', simdi: SIMDI });
const bul = (liste: Oneri[], kimlik: string): Oneri => {
  const o = liste.find((x) => x.kimlik === kimlik);
  expect(o, `öneri yok: ${kimlik}\nvar olanlar: ${liste.map((x) => x.kimlik).join(', ')}`).toBeTruthy();
  return o as Oneri;
};
const TABAN: OneriSenaryosu = { id: 's1', baslik: 'Kitap siparişi', veri: tabanVerisi('03.10.2026'), sonDurum: 'basarili' };

test('fikstür modeli ekran modeli doğrulayıcısından geçer; hatalı "sinirlar" reddedilir', () => {
  expect(() => ekranModeliniDogrula('siparis.model.json', siparisModeli(), () => undefined)).not.toThrow();
  const bozuk = siparisModeli();
  bozuk.adimlar[0].bolumler[0].alanlar[1].sinirlar = { enAz: 'bir', enCok: 0, fazla: 1 };
  bozuk.adimlar[1].bolumler[0].alanlar[0].sinirlar = { enAz: 'yarın' };
  bozuk.adimlar[0].bolumler[0].alanlar[0].sinirlar = { enAzUzunluk: 5, enCokUzunluk: 2, desen: '(' };
  let mesaj = '';
  try { ekranModeliniDogrula('siparis.model.json', bozuk, () => undefined); } catch (e) { mesaj = String(e); }
  for (const parca of ['"enAz" sayı olmalı', 'bilinmeyen anahtar "fazla"', '"enAz" tarihte', '"enAzUzunluk" "enCokUzunluk"tan büyük olamaz', '"desen" geçerli bir düzenli ifade değil']) {
    expect(mesaj).toContain(parca);
  }
});

test('zorunlu alanlar: alan başına bir öneri, alan bilerek boş; beklenen sonuç yalnız modeldeki gösterge / kuraldan (yoksa "siz seçin")', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  expect(s.taban).toMatchObject({ kaynak: 'senaryo', senaryoId: 's1', eksikler: [] });
  const zorunlu = s.oneriler.filter((o) => o.tur === 'zorunlu').map((o) => o.kimlik);
  // Beden ve hediye notu tabanda görünmüyor (koşulları sağlanmıyor): önerilmez.
  expect(zorunlu).toEqual(['zorunlu:urunAdi', 'zorunlu:adet', 'zorunlu:kategori', 'zorunlu:teslimatTarihi', 'zorunlu:telefon']);

  // Adet: ürün adımında iş kuralı mesajı var → hata beklenir, mesajıyla; doğrulayıcıdan geçer (boşluk uyarıdır).
  const adet = bul(s.oneriler, 'zorunlu:adet');
  expect(adet.baslik).toBe('Zorunlu alan boş: Adet');
  expect(adet.veri).not.toHaveProperty('adet');
  expect(adet.veri.bilerekBos).toEqual(['adet']);
  expect(adet.veri).toMatchObject({ baslik: 'Zorunlu alan boş: Adet', urunAdi: 'Roman', kategori: 'kitap', beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'urun', mesaj: 'Lütfen adet giriniz.' } });
  expect(adet.beklenen).toMatchObject({ tur: 'hata', adim: 'urun', mesajEksik: false });
  expect(adet.eklenebilir).toBe(true);
  const d = dogrula(model, adet.veri);
  expect(d.hatalar).toEqual([]);
  expect(d.uyarilar).toContainEqual({ alan: 'adet', mesaj: MESAJLAR.bilerekBos('Adet') });

  // Ürün adı: adımın hata göstergesi var ama bu alan için mesaj yok → hata beklenir, mesajı kullanıcı yazar.
  const urun = bul(s.oneriler, 'zorunlu:urunAdi');
  expect(urun.beklenen).toMatchObject({ tur: 'hata', adim: 'urun', mesaj: '', mesajEksik: true });
  expect(urun.beklenenMetni).toContain('mesajı siz yazın');

  // Teslimat tarihi: teslimat adımında gösterge / kural yok → tahmin yok.
  const tarih = bul(s.oneriler, 'zorunlu:teslimatTarihi');
  expect(tarih.beklenen.tur).toBe('belirsiz');
  expect(tarih.beklenenMetni).toBe('Beklenen sonucu siz seçin');
  expect(tarih.eklenebilir).toBe(false);
  expect(tarih.veri).not.toHaveProperty('beklenenSonuc');

  // Bilerek boş olmayan zorunlu boşluk hâlâ hatadır.
  const { bilerekBos: _yok, ...bosVeri } = adet.veri;
  expect(dogrula(model, bosVeri).hatalar).toContainEqual({ alan: 'adet', mesaj: MESAJLAR.zorunlu('Adet') });
});

test('koşucu: bilerek boş alana modelin varsayılanını yazmaz (varsayılan yalnız gerçekten boş bırakılan alana)', () => {
  const model = siparisModeli();
  const veri = { ...tabanVerisi('03.10.2026'), adet: undefined };
  const alanlar = (v: Nesne) => modelKosuPlani(model, v).adimlar.flatMap((a: Nesne) => a.alanlar).map((x: Nesne) => [x.id, x.deger]);
  expect(alanlar(veri)).toContainEqual(['adet', 1]);
  expect(alanlar({ ...veri, bilerekBos: ['adet'] }).map(([id]: unknown[]) => id)).not.toContain('adet');
});

test('sınır değerleri yalnız modeldeki kurallardan: sayı / metin uzunluğu / tarih; kural yoksa öneri yok ve not', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  const sinir = s.oneriler.filter((o) => o.tur === 'sinir');
  const adet = sinir.filter((o) => o.kimlik.startsWith('sinir:adet:'));
  expect(adet.map((o) => o.veri.adet)).toEqual([0, 1, 2, 9, 10, 11]);
  expect(adet.map((o) => o.beklenen.tur)).toEqual(['hata', 'basari', 'basari', 'basari', 'basari', 'hata']);
  expect(adet[0].beklenen).toMatchObject({ tur: 'hata', adim: 'urun' });
  expect(adet[0].baslik).toBe('Sınır: Adet = 0 (alt sınır − 1)');

  const urun = sinir.filter((o) => o.kimlik.startsWith('sinir:urunAdi:'));
  expect(urun.map((o) => String(o.veri.urunAdi).length)).toEqual([2, 3, 4, 9, 10, 11]);
  expect(urun.map((o) => o.beklenen.tur)).toEqual(['hata', 'basari', 'basari', 'basari', 'basari', 'hata']);
  // Metin tabandaki değerden türetilir (rastgele değil).
  expect(urun[1].veri.urunAdi).toBe('Rom');

  const tarih = sinir.filter((o) => o.kimlik.startsWith('sinir:teslimatTarihi:'));
  // Sınır bugüne göre olduğundan öneri de bugüne göre yazılır (eskimez); açıklamada bugünkü karşılığı.
  expect(tarih.map((o) => o.veri.teslimatTarihi)).toEqual(['bugün', 'bugün+1', 'bugün+2', 'bugün+29', 'bugün+30', 'bugün+31']);
  expect(tarih[1].ozet).toContain('= bugün+1 → 29.09.2026');
  // Geçersiz sınır: hata alanın adımında beklenir (teslimat), mesajı kullanıcı yazar.
  expect(tarih.map((o) => o.beklenen.tur)).toEqual(['hata', 'basari', 'basari', 'basari', 'basari', 'hata']);
  expect(tarih[0].beklenen).toMatchObject({ adim: 'teslimat', mesaj: '', mesajEksik: true });
  expect(adet[0].beklenen).toMatchObject({ mesajEksik: true });
  expect(tarih[1].ozet).toContain('bugüne göre yazıldı');

  // Kural yok: sipariş notu için öneri yok, kuralı eklemeyi öneren not var. Yalnız desen: değer üretilmez.
  expect(sinir.some((o) => o.kimlik.includes('siparisNotu') || o.kimlik.includes('kuponKodu') || o.kimlik.includes('hediyeNotu'))).toBe(false);
  const notlar = s.notlar.filter((n) => n.tur === 'sinir').map((n) => n.mesaj).join('\n');
  expect(notlar).toMatch(/Sınır kuralı tanımlı olmayan alanlar: Sipariş notu, Hediye notu\./);
  expect(notlar).toContain('"sinirlar"');
  expect(notlar).toContain('"Kupon kodu" için yalnız desen kuralı var');
});

test('kişisel / gizli alanda değer üretilmez: telefon tabandan kopyalanır ya da tablodan gelir, gösterimde maskeli', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  // Telefonun sınır kuralı var ama gizli alan: öneri yok, not var.
  expect(s.oneriler.some((o) => o.kimlik.startsWith('sinir:telefon'))).toBe(false);
  expect(s.notlar.map((n) => n.mesaj).join('\n')).toContain('"Telefon" kişisel / gizli bir alan: sınır değeri üretilmez');
  for (const o of s.oneriler) {
    expect([TELEFON, undefined], o.kimlik).toContain(o.veri.telefon);
    expect(JSON.stringify([o.baslik, o.ozet, o.degisiklikler]), o.kimlik).not.toContain(TELEFON);
  }
  // Senaryo yokken taban modelin varsayılanları; telefon bağlı tablonun başvurusuyla dolar, üretilmez.
  const bos = senaryoOnerileri(girdi(model, [], { tabloBasvurulari: { telefon: '${Müşteriler.Telefon}' } }));
  expect(bos.taban.kaynak).toBe('varsayilan');
  expect(bos.taban.eksikler).toEqual(['Ürün adı', 'Kategori', 'Teslimat tarihi']);
  for (const o of bos.oneriler) expect(['${Müşteriler.Telefon}', undefined], o.kimlik).toContain(o.veri.telefon);
  const adetOnerisi = bul(bos.oneriler, 'zorunlu:adet');
  expect(adetOnerisi.eksikler).toEqual(['Ürün adı', 'Kategori', 'Teslimat tarihi']);
  expect(adetOnerisi.eklenebilir).toBe(false);
  // Hassas seçim alanı da maskelenir.
  const gizliModel = siparisModeli();
  gizliModel.adimlar[0].bolumler[0].alanlar[2].hassas = true;
  const g = senaryoOnerileri(girdi(gizliModel, [TABAN], { kombinasyonAlanlari: ['kategori', 'renk'] }));
  expect(g.kombinasyon.secilebilir.map((x) => x.id)).not.toContain('kategori');
  expect(g.oneriler.some((o) => o.kimlik.startsWith('kosullu:kategori'))).toBe(false);
  expect(MASKE).toMatch(/^•+$/);
});

test('koşullu alanlar: her dal için görünen / görünmeyen alanlar, o dalda zorunlular, bağlı liste; eksik değer üretilmez', () => {
  const model = siparisModeli();
  const s = senaryoOnerileri(girdi(model, [TABAN]));
  const kosullu = s.oneriler.filter((o) => o.tur === 'kosullu');
  expect(kosullu.map((o) => o.kimlik)).toEqual([
    'kosullu:kategori=kitap', 'kosullu:kategori=giyim', 'kosullu:kategori=elektronik', 'kosullu:hediyePaketi=true', 'kosullu:hediyePaketi=false'
  ]);
  const giyim = bul(kosullu, 'kosullu:kategori=giyim');
  expect(giyim.baslik).toBe('Koşul: Kategori = Giyim');
  expect(giyim.ozet).toContain('görünür: Beden');
  expect(giyim.ozet).toContain('bu dalda zorunlu: Beden');
  expect(giyim.ozet).toContain('Renk seçenekleri: Kırmızı, Mavi');
  expect(giyim.veri).toMatchObject({ kategori: 'giyim', renk: 'kirmizi' });
  expect(giyim.veri).not.toHaveProperty('beden'); // değer üretilmez: eksik
  expect(giyim.eksikler).toEqual(['Beden']);
  expect(giyim.eklenebilir).toBe(false);
  const kitap = bul(kosullu, 'kosullu:kategori=kitap');
  expect(kitap.ozet).toContain('görünmez: Beden');
  expect(kitap.mevcut).toEqual({ id: 's1', baslik: 'Kitap siparişi' }); // taban zaten bu dal
  const elektronik = bul(kosullu, 'kosullu:kategori=elektronik');
  expect(elektronik).toMatchObject({ eklenebilir: true, mevcut: null, beklenen: { tur: 'basari' } });
  expect(elektronik.veri.renk).toBe('siyah');
  expect(dogrula(model, elektronik.veri).hatalar).toEqual([]);
  const hediye = bul(kosullu, 'kosullu:hediyePaketi=true');
  expect(hediye.ozet).toContain('görünür: Hediye notu');
  expect(hediye.eksikler).toEqual(['Hediye notu']);
  expect(bul(kosullu, 'kosullu:hediyePaketi=false').mevcut?.id).toBe('s1');
});

test('kombinasyonlar: yalnız işaretlenen alanlar, bağımlı listeye uyar, mevcutlar işaretli; en çok 3 alan ve üst sınır', () => {
  const model = siparisModeli();
  const bos = senaryoOnerileri(girdi(model, [TABAN]));
  expect(bos.oneriler.some((o) => o.tur === 'kombinasyon')).toBe(false);
  expect(bos.kombinasyon.secilebilir.map((x) => x.id)).toEqual(['kategori', 'beden', 'renk']);
  const s = senaryoOnerileri(girdi(model, [TABAN], { kombinasyonAlanlari: ['kategori', 'renk'] }));
  expect(s.kombinasyon).toMatchObject({ secili: ['kategori', 'renk'], toplam: 5, mevcut: 1, eksik: 4, kesildi: false });
  const liste = s.oneriler.filter((o) => o.tur === 'kombinasyon');
  expect(liste.map((o) => o.baslik)).toEqual([
    'Kombinasyon: Kategori = Giyim, Renk = Kırmızı', 'Kombinasyon: Kategori = Giyim, Renk = Mavi', 'Kombinasyon: Kategori = Elektronik, Renk = Siyah',
    'Kombinasyon: Kategori = Elektronik, Renk = Beyaz', 'Kombinasyon: Kategori = Kitap, Renk = Standart'
  ]);
  expect(liste[4].mevcut?.id).toBe('s1');
  expect(liste[4].eklenebilir).toBe(false);

  // Üst sınır: 3 alan × 5 seçenek = 125 kombinasyon → en çok KOMBINASYON_UST_SINIRI öneri; 4. alan alınmaz.
  const genis = siparisModeli();
  const bes = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ deger: x, metin: x.toUpperCase() }));
  genis.adimlar[0].bolumler[0].alanlar.push(
    { ...genis.adimlar[0].bolumler[0].alanlar[2], id: 'desen1', eslesme: { senaryo: 'desen1' }, etiket: { ekran: 'Desen 1' }, konum: { secici: '#d1', kirilganlik: 'orta' }, zorunlu: false, secenekler: bes },
    { ...genis.adimlar[0].bolumler[0].alanlar[2], id: 'desen2', eslesme: { senaryo: 'desen2' }, etiket: { ekran: 'Desen 2' }, konum: { secici: '#d2', kirilganlik: 'orta' }, zorunlu: false, secenekler: bes },
    { ...genis.adimlar[0].bolumler[0].alanlar[2], id: 'desen3', eslesme: { senaryo: 'desen3' }, etiket: { ekran: 'Desen 3' }, konum: { secici: '#d3', kirilganlik: 'orta' }, zorunlu: false, secenekler: bes }
  );
  const k = senaryoOnerileri(girdi(genis, [TABAN], { kombinasyonAlanlari: ['desen1', 'desen2', 'desen3', 'kategori'] }));
  expect(k.kombinasyon).toMatchObject({ secili: ['desen1', 'desen2', 'desen3'], toplam: 125, kesildi: true, listelenen: KOMBINASYON_UST_SINIRI });
  expect(k.oneriler.filter((o) => o.tur === 'kombinasyon')).toHaveLength(KOMBINASYON_UST_SINIRI);
  expect(k.notlar.map((n) => n.mesaj).join('\n')).toContain('en çok 3 alan');
  expect(k.notlar.map((n) => n.mesaj).join('\n')).toContain(`en çok ${KOMBINASYON_UST_SINIRI} öneri listelenir`);
});

test('mevcut: aynı öneri tekrar üretilince içeriği bir senaryoda olanlar işaretli ve eklenemez', () => {
  const model = siparisModeli();
  const ilk = senaryoOnerileri(girdi(model, [TABAN]));
  const eklenecek = [bul(ilk.oneriler, 'zorunlu:adet'), bul(ilk.oneriler, 'sinir:adet:10'), bul(ilk.oneriler, 'kosullu:kategori=elektronik')];
  const kayitlilar: OneriSenaryosu[] = [TABAN, ...eklenecek.map((o, i) => ({ id: `y${i}`, baslik: o.baslik, veri: o.veri }))];
  const ikinci = senaryoOnerileri(girdi(model, kayitlilar));
  for (const o of eklenecek) {
    const tekrar = bul(ikinci.oneriler, o.kimlik);
    expect(tekrar.mevcut?.baslik).toBe(o.baslik);
    expect(tekrar.eklenebilir).toBe(false);
  }
  // Taban değişmez: başarı bekleyen ve bilerek boşu olmayan senaryo.
  expect(ikinci.taban.senaryoId).toBe('s1');
  expect(bul(ikinci.oneriler, 'zorunlu:urunAdi').mevcut).toBeNull();
});

test('modelde beklenen sonuç yoksa hata beklentisi kurulmaz: "siz seçin"', () => {
  const model = siparisModeli();
  model.senaryoDuzeyi.alanlar = model.senaryoDuzeyi.alanlar.filter((a: Nesne) => a.tip !== 'birlesim');
  const s = senaryoOnerileri(girdi(model, [{ ...TABAN, veri: tabanVerisi('03.10.2026') }]));
  expect(bul(s.oneriler, 'zorunlu:adet').beklenen.tur).toBe('belirsiz');
  expect(bul(s.oneriler, 'sinir:adet:0').beklenen.tur).toBe('belirsiz');
  expect(bul(s.oneriler, 'sinir:adet:1').beklenen.tur).toBe('basari');
});
