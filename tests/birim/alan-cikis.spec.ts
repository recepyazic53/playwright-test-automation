// Hızlı test / koşucu: alan doldurulunca alandan çıkılır (Tab); blur'da sorgu yapan sayfa sonucu görür.
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfa.
import { expect, test } from '@playwright/test';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';

const SAYFA = `<!doctype html><meta charset="utf-8"><body>
<input id="tc" aria-label="Kimlik"><span id="sonuc"></span><input id="ad" aria-label="Ad">
<script>document.getElementById('tc').addEventListener('change',()=>{document.getElementById('sonuc').textContent='sorgu:'+document.getElementById('tc').value;document.getElementById('ad').value='SAHTE';});</script></body>`;

test('doldur + Tab: change tetiklenir, sorgu sonucu görünür', async () => {
  const s = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: SAYFA }));
  const t = await korumaliTarayici();
  try {
    const page = await (await t.newContext()).newPage();
    await page.goto(`${s.adres}/`);
    const l = page.locator('#tc');
    await l.fill('123');
    await expect(page.locator('#sonuc')).toHaveText('');
    await l.press('Tab');
    await expect(page.locator('#sonuc')).toHaveText('sorgu:123');
    await expect(page.locator('#ad')).toHaveValue('SAHTE');
  } finally { await t.close(); await s.kapat(); }
});
