// POLİGON KALANLARI — hızlı test poligonunun son eksikleri (uçtan uca, poligon ekranlarında):
//  1) etkinlik: başka ekranların daha önce yazdığı aynı adlı "Kişi bilgileri" tablosu varken (ilk satırda Vergi no boş) yalnız gizli
//     sütunlu değer (Vergi no) YENİ satır olarak birleştirilir, senaryo o satıra satır kimliğiyle sabitlenir; normal koşu doğru değeri gönderir.
//  2) başvuru: zorunlu dosya alanı — "Dosya seç" (yükleme ucu; test fikstürü olarak küçük örnek dosya) şifreli depoya yazılır, senaryoya
//     başvuru olarak kaydedilir; hızlı test, doğrulama ve normal koşu dosyayı yükler (sunucu dosyayı alır). "Depodan seç" listesi.
//  3) uçak: "Doldur" yolcu adı / soyadı için Kişiler.Ad / Soyad aday (benzer; kendiliğinden dolmaz).
//  4) arama: plan "Oda sayısı" değeriyle veri aşaması.
// Güvenlik: yalnız 127.0.0.1 (poligon), ayrı Nöbetçi + geçici veri kökü; kullanıcının veri/ klasörüne ve 5566'ya dokunulmaz.
import { expect, test } from '@playwright/test';
import { PLANLAR } from '../poligon/planlar';
import { ekranKos, isBitsin, oturumBekle, poligonOrtami, type Nesne, type PoligonOrtami } from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';

test.describe.configure({ mode: 'serial' });
const plan = (kok: string) => {
  const p = PLANLAR.find((x) => x.kok === kok);
  if (!p) throw new Error(kok);
  return p;
};

let po: PoligonOrtami;
test.describe('poligon kalanları', () => {
  test.beforeAll(async () => { test.setTimeout(120_000); po = await poligonOrtami(); });
  test.afterAll(async () => { await po?.kapat(); });

  test('etkinlik: önceden var olan "Kişi bilgileri" (Vergi no boş satır) varken Vergi no yeni satıra yazılır; normal koşu vergiNo gönderir', async () => {
    test.setTimeout(400_000);
    // Başka bir ekranın daha önce yazdığı aynı adlı tablo (değerler uydurma): ilk satırda Vergi no yok.
    const t = await po.api('/platform/tablo/kaydet', {
      projeId: po.projeId, ad: 'Kişi bilgileri', tur: 'kayit', sutunlar: [{ ad: 'Telefon' }, { ad: 'Vergi no', gizli: true }],
      satirlar: [{ ad: 'Başka ekran', degerler: { Telefon: '05001112233' } }]
    });
    expect(t.basarili, t.mesaj).toBe(true);
    const r = await ekranKos(po, plan('/etkinlik'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
    expect((r.sonGonderim as Nesne).vergiNo).toBe('1234567890');
    // Senaryo kendi satırına satır kimliğiyle sabitli; tabloda iki satır (eski satır değişmedi).
    const sen = r.senaryo as Nesne;
    const secimler = Object.values((sen.tabloSecimleri ?? sen.icerik?.tabloSecimleri ?? {}) as Record<string, Record<string, string>>);
    expect(secimler.some((s) => typeof s.$satir === 'string' && s.$satir.length > 0), JSON.stringify(secimler)).toBe(true);
    const tablolar = (await po.api(`/platform/tablolar?projeId=${po.projeId}&secim=1`)).tablolar as Nesne[];
    const kisi = tablolar.find((x) => x.ad === 'Kişi bilgileri') as Nesne;
    expect(kisi.satirlar.length).toBe(2);
    expect(kisi.satirlar.find((x: Nesne) => x.ad === 'Başka ekran')?.degerler.Telefon).toBe('05001112233');
  });

  test('başvuru: zorunlu özgeçmiş dosyası "Dosya seç" ile şifreli depoya yüklenir; Nöbetçi taraması, doğrulama ve normal koşu dosyayı gönderir', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/basvuru'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
    expect((r.sonGonderim as Nesne).dosyalar).toEqual([{ alan: 'ozgecmis', ad: 'ozgecmis-ornek.txt', boyut: 6 }]);
    // Senaryoda dosya başvuru olarak durur (düz yol / içerik yok).
    const veri = ((r.senaryo as Nesne).veri ?? (r.senaryo as Nesne).icerik?.veri ?? {}) as Record<string, unknown>;
    expect(Object.values(veri).some((v) => typeof v === 'string' && /^nobetci-dosya:\/\/[0-9a-f-]{36}\/ozgecmis-ornek\.txt$/.test(v)), JSON.stringify(veri)).toBe(true);
    // Yeni hızlı testte "Depodan seç": projenin dosya deposunda bu dosya listelenir (içerik dönmez).
    const b = await po.api('/platform/hizli-test/baslat', { projeId: po.projeId, ortamId: po.ortamId, hedef: '/basvuru/', ekranAdi: 'Poligon iş başvurusu depodan', izin: 'hayir' });
    expect(b.basarili, b.mesaj).toBe(true);
    try {
      const d = await po.api(`/platform/hizli-test/dosyalar?id=${String(b.id)}`);
      expect(((d.dosyalar ?? []) as Nesne[]).map((x) => x.ad)).toContain('ozgecmis-ornek.txt');
      expect(JSON.stringify(d)).not.toContain('örnek"');
    } finally {
      await po.api('/platform/hizli-test/iptal', { id: String(b.id) });
    }
  });

  test('arayüz: veri durağında dosya alanı — "Dosya seç" (tarayıcı dosya girdisi) yükler, ad + "şifreli depoda" görünür; "Depodan seç" listeler', async () => {
    test.setTimeout(300_000);
    const b = await po.api('/platform/hizli-test/baslat', { projeId: po.projeId, ortamId: po.ortamId, hedef: '/basvuru/', ekranAdi: 'Poligon başvuru arayüz', izin: 'evet' });
    expect(b.basarili, b.mesaj).toBe(true);
    const id = String(b.id);
    const tarayici = await korumaliTarayici();
    try {
      let x = await oturumBekle(po, id);
      expect(x.durum).toBe('veri');
      const deger = (et: RegExp, d: string): [string, Nesne] => [String((x.soru.alanlar as Nesne[]).find((a) => et.test(String(a.etiket)))?.anahtar), { deger: d, kaynak: 'elle' }];
      const y = await po.api('/platform/hizli-test/veri', { id, degerler: Object.fromEntries([deger(/^Ad$/, 'Deneme'), deger(/^Soyad$/, 'Kişi'), deger(/^E-posta$/, 'deneme@ornek.test')]) });
      expect(y.basarili, y.mesaj).toBe(true);
      x = await oturumBekle(po, id);
      // Evet izni, tek aday "İleri": basılır; 2. adımın veri durağı (Pozisyon, Özgeçmiş…).
      if (x.durum === 'karar') {
        const ileri = (x.soru.adaylar as Nesne[]).find((a) => /^İleri$/.test(String(a.metin)));
        await po.api('/platform/hizli-test/karar', { id, karar: 'bas', secici: ileri?.secici });
        x = await oturumBekle(po, id);
      }
      expect(x.durum, JSON.stringify(x.soru)).toBe('veri');
      const ozgecmis = (x.soru.alanlar as Nesne[]).find((a) => a.tur === 'file') as Nesne;
      expect(ozgecmis?.kabul).toBe('.pdf,.txt');
      const sayfa = await tarayici.newPage();
      await sayfa.goto(`${po.nobetci.adres}/#/hizli-test/o/${id}`);
      const satir = sayfa.locator(`.hizli-alan[data-anahtar="${String(ozgecmis.anahtar)}"]`);
      await expect(satir.getByRole('button', { name: /^Dosya seç: Özgeçmiş/ })).toBeVisible({ timeout: 30_000 });
      await expect(satir).toContainText('Dosya seçilmedi');
      // Kullanıcının bilgisayarından seçim (tarayıcı dosya girdisi): test fikstürü küçük dosya.
      await satir.locator('input[type="file"]').setInputFiles({ name: 'ozgecmis-arayuz.txt', mimeType: 'text/plain', buffer: Buffer.from('örnek', 'utf8') });
      await expect(satir.locator('.hizli-dosya-adi')).toHaveText(/ozgecmis-arayuz\.txt/, { timeout: 15_000 });
      await expect(satir).toContainText('şifreli depoda');
      await expect(satir.getByRole('button', { name: /^Başka dosya seç: Özgeçmiş/ })).toBeVisible();
      // Uzantısı kabul edilmeyen dosya: tarayıcıda reddedilir, açık ileti.
      await satir.locator('input[type="file"]').setInputFiles({ name: 'resim.png', mimeType: 'image/png', buffer: Buffer.from('x') });
      await expect(sayfa.getByText('Yalnızca .pdf, .txt uzantılı dosyalar kabul edilir.')).toBeVisible();
      // Depodan seç: projenin şifreli dosyaları listelenir.
      await satir.getByRole('button', { name: 'Depodan seç' }).click();
      const liste = satir.getByRole('combobox', { name: /depodaki dosyalar/ });
      await expect(liste).toBeVisible();
      await expect(liste.locator('option')).toContainText([/ozgecmis-arayuz\.txt/]);
    } finally {
      await tarayici.close();
      await po.api('/platform/hizli-test/iptal', { id });
      await isBitsin(po);
    }
  });

  test('uçak: "Doldur" Yolcu adı / Yolcu soyadı için Kişiler.Ad / Soyad aday (benzer); baştan sona geçer', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/ucak'));
    expect((r.bulgular as string[]).filter((m) => /aday değil/.test(m)), JSON.stringify(r.doldur)).toEqual([]);
    const yolcu = ((r.doldur ?? []) as Nesne[]).filter((x) => /^Yolcu (adı|soyadı)$/.test(String(x.alan)));
    expect(yolcu.map((x) => x.adaylar)).toEqual(expect.arrayContaining([['Kişiler.Ad (benzer)'], ['Kişiler.Soyad (benzer)']]));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  });

  test('arama: "Oda sayısı" plan değeriyle (2+1) veri aşaması geçer', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/arama'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, eylem: true, normal: true, sayac: true });
  });
});
