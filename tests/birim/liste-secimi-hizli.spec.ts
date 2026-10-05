// AÇILIR LİSTEDE KOD + AD AYNI ANDA (secenek-secimi.ts; normal koşu ve hızlı test ortak kural). Gerçek koşuda görülen sorunun koruması:
// seçeneklerin değeri kod ("1"), metni ad ("ADANA"); test verisinde kod yoksa senaryo değeri ad olur ve önce değerle aranırken her bağlı
// listede sınır süresi (≈15 sn) boşa bekleniyordu. Artık tek döngüde her turda değer YA DA metin aranır; harf duyarsız; liste dolu ve
// sabitse hedef yoksa erken, açık iletiyle düşer. Ayrıca: tabloya bağlı alanın düz değerine sütunun sayfa karşılığı uygulanır ve plan
// seçenekleri bağlı listenin seçenek haritasını da taşır.
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfa; dış istek yok. Değerler UYDURMADIR.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { LISTE_SABIT_MS, listedeYokMetni, listedenSecenekSec, secenekEslestir } from '../../scripts/platform/tarama/secenek-secimi';
import { bagliDuzDegerVarMi, ekranBasvurulariniCoz } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { modelKosuPlani, secenekBul } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import type { Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';

const s = (deger: string, metin: string): { deger: string; metin: string } => ({ deger, metin });

test.describe('eşleştirme kuralı (saf)', () => {
  const iller = [s('', 'Seçiniz'), s('1', 'ADANA'), s('6', 'ANKARA'), s('34', 'İSTANBUL'), s('35', 'İZMİR')];

  test('değer tam > metin tam > harf duyarsız > "kod - ad"; ad verilince kod seçilir', () => {
    expect(secenekEslestir(iller, s('34', '34'))).toEqual(s('34', 'İSTANBUL'));
    expect(secenekEslestir(iller, s('ADANA', 'ADANA'))).toEqual(s('1', 'ADANA'));
    expect(secenekEslestir(iller, s('İstanbul', 'İstanbul'))).toEqual(s('34', 'İSTANBUL'));
    expect(secenekEslestir([s('k', 'İSTANBUL')], s('istanbul', 'istanbul'))).toEqual(s('k', 'İSTANBUL'));
    expect(secenekEslestir(iller, s('  izmir ', '  izmir '))).toEqual(s('35', 'İZMİR'));
    expect(secenekEslestir(iller, s('Bursa', 'Bursa'))).toBeNull();
    // Belirsizlik: tam metin, harf duyarsız eşleşmeden önce gelir; değer eşleşmesi metinden önce.
    expect(secenekEslestir([s('a', 'ankara'), s('b', 'ANKARA')], s('ANKARA', 'ANKARA'))).toEqual(s('b', 'ANKARA'));
    expect(secenekEslestir([s('X', 'Y'), s('Y', 'X')], s('X', 'X'))).toEqual(s('X', 'Y'));
    // "kod - ad" metinli liste: kodla (sözcük sınırıyla) başlar, sonra adı içerir; "1" "10 - …" seçeneğine uymaz.
    const kodlu = [s('a', '10 - ON'), s('b', '1 - BİR'), s('c', '2 - İKİ')];
    expect(secenekEslestir(kodlu, s('1', '1'))).toEqual(s('b', '1 - BİR'));
    expect(secenekEslestir(kodlu, s('iki', 'iki'))).toEqual(s('c', '2 - İKİ'));
    expect(secenekEslestir(kodlu, s('3', '3'))).toBeNull();
    // Kısmi eşleşmede birden çok aday belirsizdir: tahmin edilmez (ilki seçilmez), "listede yok" iletisiyle düşer.
    expect(secenekEslestir([s('a', '1 - ADANA MERKEZ'), s('b', '6 - ANKARA MERKEZ')], s('Merkez', 'Merkez'))).toBeNull();
    // Yer tutucu kısmi eşleşmede aday değildir.
    expect(secenekEslestir([s('', 'Seçiniz')], s('Seç', 'Seç'))).toBeNull();
  });

  test('listede yok iletisi: ilk 6 seçenek ve toplam; boş liste', () => {
    const uzun = Array.from({ length: 9 }, (_, i) => s(String(i + 1), `S${i + 1}`));
    expect(listedeYokMetni('İl', 'Bursa', { liste: [s('', 'Seçiniz'), ...uzun], bekleyisMs: 1300 })).toBe('İl: “Bursa” listede yok (listede: S1, S2, S3, S4, S5, S6 … 9 seçenek)');
    expect(listedeYokMetni('İl', 'Bursa', { liste: uzun.slice(0, 2), bekleyisMs: 1300 })).toBe('İl: “Bursa” listede yok (listede: S1, S2)');
    expect(listedeYokMetni('İlçe', 'X', { liste: [s('', 'Seçiniz')], bekleyisMs: 15_000 })).toBe('İlçe: “X” listede yok (liste boş kaldı; 15 sn beklendi)');
  });
});

/**
 * Sahte bağlı liste: #il (değer = kod, metin = ad; hemen dolu) → #ilce (üst seçilince yer tutucu kalır, ~1 sn sonra dolar).
 * window.__secimler: listelerin change olaylarıyla aldığı değerler.
 */
const SAYFA = String.raw`<!doctype html><meta charset="utf-8"><body>
<label for="il">İl</label> <select id="il"><option value="">Seçiniz</option><option value="1">ADANA</option><option value="6">ANKARA</option><option value="34">İSTANBUL</option></select>
<label for="ilce">İlçe</label> <select id="ilce"><option value="">Seçiniz</option></select>
<script>
  var ILCELER = { '1': [['101', 'SEYHAN'], ['102', 'ÇUKUROVA']], '6': [['601', 'ÇANKAYA'], ['602', 'KEÇİÖREN']], '34': [['3401', 'KADIKÖY'], ['3402', 'ÜSKÜDAR']] };
  window.__secimler = [];
  var il = document.getElementById('il'), ilce = document.getElementById('ilce');
  il.addEventListener('change', function () {
    window.__secimler.push('il=' + il.value);
    ilce.innerHTML = '<option value="">Seçiniz</option>';
    var liste = ILCELER[il.value] || [];
    setTimeout(function () { liste.forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.text = x[1]; ilce.appendChild(o); }); }, 1000);
  });
  ilce.addEventListener('change', function () { window.__secimler.push('ilce=' + ilce.value); });
</script></body>`;

test.describe('sahte bağlı liste (127.0.0.1)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  let page: Page;
  test.beforeAll(async () => {
    sunucu = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: SAYFA }));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });
  test.beforeEach(async () => {
    page = await (await tarayici.newContext()).newPage();
    await page.goto(`${sunucu.adres}/`);
  });
  test.afterEach(async () => { await page.context().close(); });

  const sec = (secici: string, hedef: { deger: string; metin: string }, etiket: string) => listedenSecenekSec(page.locator(secici), hedef, { sinirMs: 15_000, etiket });
  const sure = async <T>(f: () => Promise<T>): Promise<{ sonuc: T; ms: number }> => { const b = Date.now(); const sonuc = await f(); return { sonuc, ms: Date.now() - b }; };

  test('ad verilince 15 sn beklenmez; kod verilince seçilir; "İstanbul" ↔ "İSTANBUL"', async () => {
    const ad = await sure(() => sec('#il', s('ANKARA', 'ANKARA'), 'İl'));
    expect(ad.sonuc).toMatchObject({ secenek: s('6', 'ANKARA') });
    expect(ad.ms).toBeLessThan(3_000);
    await expect(page.locator('#il')).toHaveValue('6');
    expect((await sec('#il', s('1', 'Adana'), 'İl'))).toMatchObject({ secenek: s('1', 'ADANA') });
    await expect(page.locator('#il')).toHaveValue('1');
    const harf = await sure(() => sec('#il', s('İstanbul', 'İstanbul'), 'İl'));
    expect(harf.sonuc).toMatchObject({ secenek: s('34', 'İSTANBUL') });
    expect(harf.ms).toBeLessThan(3_000);
    await expect(page.locator('#il')).toHaveValue('34');
    // Seçim olayları sayfaya gider (bağlı liste yüklenir).
    expect(await page.evaluate(() => (window as unknown as { __secimler: string[] }).__secimler)).toEqual(['il=6', 'il=1', 'il=34']);
  });

  test('gecikmeli dolan listede hedef (adla) gelince seçilir; olmayan değer erken ve açık iletiyle düşer', async () => {
    await sec('#il', s('6', 'ANKARA'), 'İl');
    // İlçe listesi ~1 sn yer tutucuda kalır (yer tutucu "dolu" sayılmaz), sonra dolar: hedef gelir gelmez seçilir.
    const ilce = await sure(() => sec('#ilce', s('Çankaya', 'Çankaya'), 'İlçe'));
    expect(ilce.sonuc).toMatchObject({ secenek: s('601', 'ÇANKAYA') });
    expect(ilce.ms).toBeGreaterThanOrEqual(700);
    expect(ilce.ms).toBeLessThan(3_000);
    await expect(page.locator('#ilce')).toHaveValue('601');
    // Listede olmayan değer: liste dolu ve sabit → sınır süresi (15 sn) beklenmeden açık ileti.
    const yok = await sure(() => sec('#ilce', s('Bursa', 'Bursa'), 'İlçe'));
    expect(yok.sonuc).toEqual({ hata: 'İlçe: “Bursa” listede yok (listede: ÇANKAYA, KEÇİÖREN)' });
    expect(yok.ms).toBeGreaterThanOrEqual(LISTE_SABIT_MS - 200);
    expect(yok.ms).toBeLessThan(3_000);
    await expect(page.locator('#ilce')).toHaveValue('601');
  });
});

test.describe('plan seçeneği bulma (secenekBul): tam, sonra harf / boşluk duyarsız', () => {
  test('radyo: "ERKEK" → modeldeki "Erkek" seçeneği ve seçicisi; tam eşleşme kazanır', () => {
    const radyolar = [{ deger: 'Erkek', metin: 'Erkek', secici: '#Gender-E' }, { deger: 'Kadın', metin: 'Kadın', secici: '#Gender-K' }];
    expect(secenekBul(radyolar, 'ERKEK')).toEqual({ deger: 'Erkek', metin: 'Erkek', secici: '#Gender-E' });
    expect(secenekBul(radyolar, ' kadın ')).toMatchObject({ deger: 'Kadın', secici: '#Gender-K' });
    // Belirsizlik: harf duyarsız aday önde olsa da tam eşleşme kazanır; senaryo değeri, değer / metinden önce.
    expect(secenekBul([{ deger: 'erkek', metin: 'x' }, { deger: 'Erkek', metin: 'y' }], 'Erkek')).toMatchObject({ metin: 'y' });
    expect(secenekBul([{ deger: 'A', metin: 'evet' }, { deger: 'B', senaryoDegeri: 'Evet', metin: 'Olumlu' }], 'EVET')).toMatchObject({ deger: 'B' });
    // Hiç yoksa değer olduğu gibi.
    expect(secenekBul(radyolar, 'Diğer')).toEqual({ deger: 'Diğer', metin: 'Diğer', secici: null });
  });

  test('açılır liste ve oklu seçim: normalize eşleşme kodu / metni verir', () => {
    // Açılır liste: "istanbul" → kod 34 (koşucu bulunan kodla seçer).
    expect(secenekBul([{ deger: '34', metin: 'İSTANBUL' }, { deger: '6', metin: 'ANKARA' }], 'istanbul')).toMatchObject({ deger: '34', metin: 'İSTANBUL' });
    // Oklu seçim: koşucu göstergeyi modeldeki METİNLE karşılaştırır (okluSec) — "tam  kapsam" → "Tam Kapsam".
    expect(secenekBul([{ deger: 't', metin: 'Tam Kapsam' }, { deger: 'k', metin: 'Kısmi' }], 'tam  kapsam').metin).toBe('Tam Kapsam');
  });

  test('radyo (127.0.0.1): "ERKEK" verisiyle modeldeki seçici işaretlenir', async () => {
    const sunucu = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: '<!doctype html><meta charset="utf-8"><input type="radio" name="g" id="Gender-E" value="E"><label for="Gender-E">Erkek</label><input type="radio" name="g" id="Gender-K" value="K"><label for="Gender-K">Kadın</label>' }));
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      await page.goto(`${sunucu.adres}/`);
      const s = secenekBul([{ deger: 'Erkek', metin: 'Erkek', secici: '#Gender-E' }, { deger: 'Kadın', metin: 'Kadın', secici: '#Gender-K' }], 'ERKEK');
      // Koşucunun radyo kuralı: seçici varsa o, yoksa [value="…"] (model-kosucu.ts > alaniDoldur).
      const hedef = s.secici ? page.locator(s.secici) : page.locator(`[name="g"][value="${s.deger}"]`);
      await hedef.check({ timeout: 2_000 });
      await expect(page.locator('#Gender-E')).toBeChecked();
    } finally { await t.close(); await sunucu.kapat(); }
  });
});

test.describe('sayfa karşılığı ve plan seçenekleri (yan bulgu)', () => {
  const tablo: Tablo = {
    id: 't', ad: 'Konum',
    sutunlar: [{ ad: 'Tür', gizli: false, karsiliklar: { Kutu: { sayfa: 'K1' } } }, { ad: 'Not', gizli: false }],
    satirlar: [{ ortamId: null, degerler: { Tür: 'Kutu', Not: 'kutu notu' } }, { ortamId: null, degerler: { Tür: 'Raf', Not: 'raf notu' } }]
  };
  const ortak = { tablolar: [tablo], ortamId: 'o1', baglar: { turAlani: { tablo: 't', sutun: 'Tür' } }, alanAnahtarlari: { turAlani: 'tur' } };

  test('tabloya bağlı alanın DÜZ değeri: seçenekler tanımıyorsa sütunun sayfa karşılığı ekrana gider; satır seçimi tablodaki değerle', () => {
    // Modelde seçenek yok ya da senaryo değeri olarak tanımıyor: karşılık ("K1").
    expect(ekranBasvurulariniCoz({ tur: 'Kutu' }, ortak).veri).toEqual({ tur: 'K1' });
    expect(ekranBasvurulariniCoz({ tur: 'Kutu' }, { ...ortak, secenekDegerleri: { tur: ['K1', 'R1'] } }).veri).toEqual({ tur: 'K1' });
    // Satır seçimi tablodaki ("Kutu") değerle yapılır: aynı satırdan başvuru çözülür.
    expect(ekranBasvurulariniCoz({ tur: 'Kutu', not: '${Konum.Not}' }, ortak).veri).toEqual({ tur: 'K1', not: 'kutu notu' });
    // Seçenekler değeri senaryo değeri olarak tanıyor / karşılık yok / onay kutusu: değişmez.
    expect(ekranBasvurulariniCoz({ tur: 'Kutu' }, { ...ortak, secenekDegerleri: { tur: ['Kutu', 'Raf'] } }).veri).toEqual({ tur: 'Kutu' });
    expect(ekranBasvurulariniCoz({ tur: 'Raf' }, ortak).veri).toEqual({ tur: 'Raf' });
    expect(ekranBasvurulariniCoz({ tur: 'Kutu' }, { ...ortak, alanTipleri: { tur: 'onayKutusu' } }).veri).toEqual({ tur: 'Kutu' });
    // Elle yazılan alan (metin): düz değer kullanıcının yazdığıdır, aynen kalır; seçim alanında (secim / radyo) karşılık gider.
    expect(ekranBasvurulariniCoz({ tur: 'Kutu' }, { ...ortak, alanTipleri: { tur: 'metin' } }).veri).toEqual({ tur: 'Kutu' });
    expect(ekranBasvurulariniCoz({ tur: 'Kutu' }, { ...ortak, alanTipleri: { tur: 'radyo' } }).veri).toEqual({ tur: 'K1' });
    // Koşu, tabloları yalnız bağlı alanın düz değeri ya da başvuru varsa okur.
    expect(bagliDuzDegerVarMi({ tur: 'Kutu' }, ortak.baglar, ortak.alanAnahtarlari)).toBe(true);
    expect(bagliDuzDegerVarMi({ tur: '', baska: 'x' }, ortak.baglar, ortak.alanAnahtarlari)).toBe(false);
    expect(bagliDuzDegerVarMi({ tur: '${Konum.Tür}' }, ortak.baglar, ortak.alanAnahtarlari)).toBe(false);
  });

  test('plan seçenekleri: boş "secenekler" dizisi bağlı listenin seçenek haritasını gizlemez (ad → kod çevrilir)', () => {
    const model = {
      adimlar: [{ id: 'a1', sira: 1, baslik: 'Adım', bolumler: [{ alanlar: [
        { id: 'ust', tip: 'secim', yapilandirma: 'senaryo', eslesme: { senaryo: 'ust' }, konum: { secici: '#ust' }, secenekler: [{ deger: 'U', metin: 'Üst' }] },
        { id: 'alt', tip: 'secim', yapilandirma: 'senaryo', eslesme: { senaryo: 'alt' }, konum: { secici: '#alt' }, secenekler: [],
          bagimlilik: { alan: 'ust', secenekHaritasi: { U: [{ deger: 'K1', metin: 'Kutu' }, { deger: 'R1', metin: 'Raf' }] } } }
      ] }] }]
    };
    const plan = modelKosuPlani(model, { ust: 'U', alt: 'Kutu' });
    const alt = plan.adimlar[0].alanlar.find((a: { id: string }) => a.id === 'alt') as { secenekler: Array<{ deger: string; metin: string }>; deger: unknown };
    expect(alt.secenekler.map((x) => x.deger)).toEqual(['K1', 'R1']);
    expect(secenekBul(alt.secenekler, alt.deger)).toMatchObject({ deger: 'K1', metin: 'Kutu' });
  });
});
