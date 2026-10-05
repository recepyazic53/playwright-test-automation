// ÖNCE DENE, DOĞRU DEĞERE DOKUNMA (alan-cikisi.ts > alanaYaz / takvimdenYaz, secenek-secimi.ts > listedenSecenekSec; normal koşu, hızlı
// test ve doğrulama koşusu ortak). Gerçek ekranda görülen sorunun koruması: değeri zaten "1" olan +/- oklu sayı alanı temizlenip yeniden
// "1" yazılınca sayfanın change işleyicisi değeri 2 yapıyor, test "1 yazıldı ama alanda 2 kaldı" ile düşüyordu. Artık görünen değer
// istenenle aynıysa (biçimden bağımsız) alana hiç dokunulmaz; seçili seçenek zaten hedefse yeniden seçilmez.
// Güvenlik: yalnızca 127.0.0.1 / about:blank'teki sahte sayfa; dış istek yok. Değerler UYDURMADIR.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { korumaliTarayici } from './giris-fikstur';
import { alanaYaz, degerAyni, takvimdenYaz } from '../../scripts/platform/tarama/alan-cikisi';
import { listedenSecenekSec } from '../../scripts/platform/tarama/secenek-secimi';

/**
 * #adet: değeri "1" olan sayı alanı; change işleyicisi değer 2'den küçükse bir artırır (sayfanın "en az 2" düzeltmesi — yeniden yazılan
 * "1" bu yüzden 2 olurdu). #liste: "B" seçili; #tarih: takvimden seçilen (salt okunur) tarih, değeri 13.04.1998.
 * window.__degisim: alanların change sayıları.
 */
const SAYFA = String.raw`<!doctype html><meta charset="utf-8"><body>
<label for="adet">Adet</label> <input id="adet" type="number" value="1" min="0">
<label for="liste">Liste</label> <select id="liste"><option value="a">A</option><option value="b" selected>B</option></select>
<label for="tarih">Tarih</label> <input id="tarih" value="13.04.1998" readonly>
<script>
  window.__degisim = { adet: 0, liste: 0, tarih: 0 };
  var adet = document.getElementById('adet');
  adet.addEventListener('change', function () { window.__degisim.adet++; if (Number(adet.value) < 2) adet.value = String(Number(adet.value) + 1); });
  document.getElementById('liste').addEventListener('change', function () { window.__degisim.liste++; });
  document.getElementById('tarih').addEventListener('change', function () { window.__degisim.tarih++; });
</script></body>`;

const degisim = (page: Page): Promise<{ adet: number; liste: number; tarih: number }> =>
  page.evaluate(() => (window as unknown as { __degisim: { adet: number; liste: number; tarih: number } }).__degisim);

test('degerAyni: biçimden bağımsız birebir aynılık (içerme sayılmaz); tarih biçimi farkı aynı', () => {
  expect(degerAyni('1', '1')).toBe(true);
  expect(degerAyni('11', '1')).toBe(false);
  expect(degerAyni('100', '1')).toBe(false);
  expect(degerAyni('(545) 453-4564', '5454534564')).toBe(true);
  expect(degerAyni('1998-04-13', '13.04.1998')).toBe(true);
  expect(degerAyni('(___) ___ __ __', '5454534564')).toBe(false);
  expect(degerAyni('', '')).toBe(false);
  expect(degerAyni(null, '1')).toBe(false);
});

test.describe('sahte sayfa', () => {
  let tarayici: Browser;
  let page: Page;
  test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
  test.afterAll(async () => { await tarayici?.close(); });
  test.beforeEach(async () => {
    page = await (await tarayici.newContext()).newPage();
    await page.setContent(SAYFA);
  });
  test.afterEach(async () => { await page.context().close(); });

  test('sayı alanı: değer zaten "1" ve senaryo "1" → dokunulmaz (change yok), değer 1 kalır', async () => {
    expect(await alanaYaz(page.locator('#adet'), '1', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(page.locator('#adet')).toHaveValue('1');
    expect((await degisim(page)).adet).toBe(0);
  });

  test('sayı alanı: senaryo "3" → yazılır, değer 3', async () => {
    expect(await alanaYaz(page.locator('#adet'), '3', { zamanAsimiMs: 5_000 })).toBe('tamam');
    await expect(page.locator('#adet')).toHaveValue('3');
    expect((await degisim(page)).adet).toBeGreaterThan(0);
  });

  test('açılır liste: hedef zaten seçili → yeniden seçilmez (change 0); farklı hedef seçilir', async () => {
    const l = page.locator('#liste');
    expect(await listedenSecenekSec(l, { deger: 'b', metin: 'B' }, { sinirMs: 2_000, etiket: 'Liste' })).toMatchObject({ secenek: { deger: 'b' } });
    expect((await degisim(page)).liste).toBe(0);
    expect(await listedenSecenekSec(l, { deger: 'A', metin: 'A' }, { sinirMs: 2_000, etiket: 'Liste' })).toMatchObject({ secenek: { deger: 'a' } });
    await expect(l).toHaveValue('a');
    expect((await degisim(page)).liste).toBe(1);
  });

  test('takvimden seçilen tarih: değer zaten aynı (başka biçimde) → dokunulmaz', async () => {
    expect(await takvimdenYaz(page.locator('#tarih'), '1998-04-13', 5_000)).toBeNull();
    await expect(page.locator('#tarih')).toHaveValue('13.04.1998');
    expect((await degisim(page)).tarih).toBe(0);
  });
});
