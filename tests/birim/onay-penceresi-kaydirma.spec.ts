// ONAY PENCERESİ YÜKSEKLİĞİ (stil.css > .onay-diyalogu): pencere ekrandan uzunsa gövde kendi içinde kayar, alt düğme şeridi (Çalıştır /
// Vazgeç…) her zaman ekranda kalır. Önceden pencere taşınca alt kısım kesiliyor, kaydırma da olmuyordu (ör. "Seçilenleri çalıştır?":
// uzun senaryo listesi + hazırlık kontrolü). Gerçek stil dosyası setContent ile yüklenir; ağ isteği yok. Metinler uydurmadır.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { korumaliTarayici } from './giris-fikstur';

const STIL = readFileSync(join(__dirname, '..', '..', 'scripts', 'platform', 'arayuz', 'stil.css'), 'utf8');
const satirlar = (n: number): string => Array.from({ length: n }, (_, i) => `<p>Senaryo ${i + 1} / Yeni iş / Özel / Mesken / Betonarme</p>`).join('');
const govde = (n: number): string => `<div class="diyalog-govde"><h2>Seçilenleri çalıştır?</h2>${satirlar(n)}</div>`;
const alt = '<div class="diyalog-alt"><button type="button">Vazgeç</button><button type="button" class="birincil">Çalıştır</button></div>';
const SAYFA = (n: number): string => `<!doctype html><html lang="tr"><head><style>${STIL}</style></head><body>
<dialog id="duz" class="onay-diyalogu">${govde(n)}${alt}</dialog>
<dialog id="formlu" class="onay-diyalogu"><form method="dialog">${govde(n)}${alt}</form></dialog>
<dialog id="genis" class="onay-diyalogu genis-onay">${govde(n)}${alt}</dialog>
</body></html>`;

let tarayici: Browser;
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });

/** Pencereyi açar; "Çalıştır" düğmesinin ekranda olup olmadığını ve gövdenin kayıp kaymadığını döner. */
async function olc(sayfa: Page, id: string): Promise<{ dugmeEkranda: boolean; govdeKayar: boolean; dugmeTiklanir: boolean }> {
  await sayfa.evaluate((x) => (document.getElementById(x) as HTMLDialogElement).showModal(), id);
  const d = sayfa.locator(`#${id}`);
  const dugme = d.getByRole('button', { name: 'Çalıştır' });
  const sonuc = await sayfa.evaluate((x) => {
    const p = document.getElementById(x) as HTMLDialogElement;
    const b = [...p.querySelectorAll('button')].find((y) => y.textContent === 'Çalıştır') as HTMLElement;
    const r = b.getBoundingClientRect();
    const g = p.querySelector('.diyalog-govde') as HTMLElement;
    return { dugmeEkranda: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0, govdeKayar: g.scrollHeight > g.clientHeight + 1 };
  }, id);
  let dugmeTiklanir = true;
  await dugme.click({ timeout: 2_000, trial: true }).catch(() => { dugmeTiklanir = false; });
  await sayfa.evaluate((x) => (document.getElementById(x) as HTMLDialogElement).close(), id);
  return { ...sonuc, dugmeTiklanir };
}

test('kısa ekranda uzun onay penceresi: gövde kayar, "Çalıştır" ekranda ve tıklanabilir (düz, form içinde, geniş)', async () => {
  const sayfa = await (await tarayici.newContext({ viewport: { width: 1280, height: 560 } })).newPage();
  await sayfa.setContent(SAYFA(40));
  for (const id of ['duz', 'formlu', 'genis']) expect(await olc(sayfa, id), id).toEqual({ dugmeEkranda: true, govdeKayar: true, dugmeTiklanir: true });
});

test('kısa onay penceresi değişmez: kaydırma yok, düğmeler içeriğin hemen altında', async () => {
  const sayfa = await (await tarayici.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await sayfa.setContent(SAYFA(2));
  for (const id of ['duz', 'formlu']) expect(await olc(sayfa, id), id).toEqual({ dugmeEkranda: true, govdeKayar: false, dugmeTiklanir: true });
  // Pencere içeriği kadar (ekran boyu değil): kısa pencere uzamaz.
  await sayfa.evaluate(() => (document.getElementById('duz') as HTMLDialogElement).showModal());
  expect((await sayfa.locator('#duz').boundingBox())?.height ?? 0).toBeLessThan(400);
});
