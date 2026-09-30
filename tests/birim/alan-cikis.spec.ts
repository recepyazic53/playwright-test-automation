// Hızlı test / koşucu: alan doldurulunca alandan çıkılır (Tab); blur'da sorgu yapan sayfa sonucu görür.
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfa.
import { expect, test } from '@playwright/test';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { acikTakvimVar, alandanCik } from '../../scripts/platform/tarama/alan-cikisi';

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

const TAKVIMLI = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<input id="dt" aria-label="Doğum tarihi"><input id="tel" aria-label="Telefon">
<div class="ui-datepicker" id="tk" style="display:none;position:absolute;top:40px;left:0;width:200px;height:120px;background:#eee">takvim</div>
<script>
const tk=document.getElementById('tk'),dt=document.getElementById('dt');
dt.addEventListener('focus',()=>{tk.style.display='block';});
// Yalnız dışarı tıklamada kapanan (Escape / Tab ile kapanmayan) inatçı takvim.
document.addEventListener('mousedown',(o)=>{if(!tk.contains(o.target)&&o.target!==dt)tk.style.display='none';});
</script></body>`;

test('doldurulan tarih alanından sonra açık kalan takvim kapatılır', async () => {
  const s = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: TAKVIMLI }));
  const t = await korumaliTarayici();
  try {
    const page = await (await t.newContext()).newPage();
    await page.goto(`${s.adres}/`);
    const l = page.locator('#dt');
    await l.fill('13.04.1998');
    expect(await acikTakvimVar(page)).toBe(true);
    await alandanCik(l);
    expect(await acikTakvimVar(page)).toBe(false);
    await expect(page.locator('#dt')).toHaveValue('13.04.1998');
  } finally { await t.close(); await s.kapat(); }
});
