// Hızlı test "Devam et" düğme listesi: sayfa çok düğmeliyken sonradan beliren düğme de listede yer alır (puan sınırına takılmaz).
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfa.
import { expect, test } from '@playwright/test';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';

const SAYFA = `<!doctype html><meta charset="utf-8"><body>${Array.from({ length: 14 }, (_, i) => `<div><button type="button">Adım ${i + 1}</button></div>`).join('')}
<div id="modal"><button type="button" id="yeni">Poliçeleştir</button></div></body>`;

test('çok düğmeli sayfada sonradan beliren düğme "Devam et" adaylarında bulunur', async () => {
  const s = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: SAYFA }));
  const t = await korumaliTarayici();
  try {
    const page = await (await t.newContext()).newPage();
    await page.goto(`${s.adres}/`);
    expect((await eylemAdaylariniCikar(page)).gonderim.map((a) => a.metin)).not.toContain('Poliçeleştir');
    const a = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
    expect(a.gonderim.map((x) => x.metin)).toContain('Poliçeleştir');
    expect(a.gonderim).toHaveLength(15);
  } finally { await t.close(); await s.kapat(); }
});
