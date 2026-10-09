// POLİGON DÜZELTMESİ 4 (+3) — kimliği (id) olmayan radyo grupları: grup etiketi önündeki metinden / satır başlığından bulunur, seçenekler
// name + value (yoksa rol + yazı) seçicisiyle doldurulur; koşullu alanları belirleyen seçimin değeri (verilmediyse sayfanın ilk değeri)
// senaryoya yazılır, normal koşu koşulları aynı değerle değerlendirir. Restoranda "Adres başlığı" (id="baslik") alanı senaryo adıyla
// ezilmez (madde 3). Güvenlik: yalnız 127.0.0.1 (poligon / setContent), ayrı Nöbetçi + geçici veri kökü.
import { expect, test } from '@playwright/test';
import { sayfadakiAlanlar } from '../../scripts/platform/tarama/sayfa-envanteri';
import type { HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { PLANLAR } from '../poligon/planlar';
import { ekranKos, poligonOrtami, type Nesne, type PoligonOrtami } from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';

test.describe.configure({ mode: 'serial' });
const plan = (kok: string) => {
  const p = PLANLAR.find((x) => x.kok === kok);
  if (!p) throw new Error(kok);
  return p;
};

test('envanter: id\'siz radyo grubunun etiketi (önündeki metin, satır başlığı, kapsayan metin) ve seçenek seçicileri; name\'siz radyolar tek grup', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<main>
      <label for="tur">Rapor türü</label><select id="tur"><option>Özet</option></select>
      <span>Biçim:</span> <label><input type="radio" name="bicim" value="pdf" checked> PDF</label> <label><input type="radio" name="bicim" value="csv"> CSV</label>
      <div class="radyo"><span>Başvuru türü</span><br><label><input type="radio" name="tur2" value="bireysel" checked> Bireysel</label><label><input type="radio" name="tur2" value="kurumsal"> Kurumsal</label></div>
      <table><thead><tr><th></th><th>Kötü</th><th>İyi</th></tr></thead><tbody>
        <tr><td>Teslimat</td><td><input type="radio" name="teslimat" value="Kötü"></td><td><input type="radio" name="teslimat" value="İyi"></td></tr>
        <tr><td>Paketleme</td><td><input type="radio" name="paketleme" value="Kötü"></td><td><input type="radio" name="paketleme" value="İyi"></td></tr>
      </tbody></table>
      <div role="radiogroup" aria-label="Teslimat saati"><label><input type="radio" value="sabah"> Sabah</label><label><input type="radio" value="aksam"> Akşam</label></div>
    </main>`);
    const env = await page.evaluate(sayfadakiAlanlar, 0);
    const radyo = (ad: string): HamAlan | undefined => env.alanlar.find((a) => a.tur === 'radio' && a.etiket === ad);
    expect(env.alanlar.filter((a) => a.tur === 'radio').map((a) => a.etiket)).toEqual(['Biçim', 'Başvuru türü', 'Teslimat', 'Paketleme', 'Teslimat saati']);
    expect(radyo('Biçim')?.radyolar).toEqual([
      { deger: 'pdf', metin: 'PDF', secici: 'input[name="bicim"][value="pdf"]' }, { deger: 'csv', metin: 'CSV', secici: 'input[name="bicim"][value="csv"]' }
    ]);
    const adsiz = radyo('Teslimat saati') as HamAlan;
    expect(adsiz.radyolar?.map((r) => r.metin)).toEqual(['Sabah', 'Akşam']);
    for (const r of adsiz.radyolar ?? []) expect(await page.locator(r.secici as string).count(), r.secici as string).toBe(1);
  } finally { await tarayici.close(); }
});

let po: PoligonOrtami;
test.describe('poligon', () => {
  test.beforeAll(async () => { test.setTimeout(120_000); po = await poligonOrtami(); });
  test.afterAll(async () => { await po?.kapat(); });

  test('rapor (olumsuz): id\'siz "Biçim" radyosu CSV seçilir; Nöbetçi taraması, doğrulama ve normal koşu bicim=csv gönderir', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/rapor'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
    expect(r.sonGonderim).toMatchObject({ bicim: 'csv', aralik: 'ozel' });
  });

  test('restoran: ödeme radyosu (Kartla öde) seçilir, kart alanları sorulur; "Adres başlığı" senaryoda kendi anahtarıyla, sunucuya "Ev" gider', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/restoran'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ dogrulama: true, kayit: true, normal: true });
    expect((r.sorulanAlanlar as string[]).some((x) => /Kart numarası/.test(x)), JSON.stringify(r.sorulanAlanlar)).toBe(true);
    expect((r.sonGonderim as Nesne).adres?.baslik).toBe('Ev');
    expect((r.sonGonderim as Nesne).odeme).toBe('kart');
  });
});
