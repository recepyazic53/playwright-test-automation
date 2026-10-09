// KEŞİFTE AÇILAN SAYFA İÇİ UYARI — seçim keşfi bir onay kutusunu / seçeneği denerken sayfa kendi uyarı penceresini açabilir ("önce X
// girilmeden bu seçilemez"). Açık kalan pencere sonraki alanların önünü keser. Keşif her denemeden ve geri almadan sonra YENİ açılan
// pencereyi kapatma düğmesiyle (Tamam / Kapat / ×) kapatır, metnini keşif notuna yazar; önceden açık olan pencereye dokunmaz.
// Güvenlik: page.setContent (ağsız), korumalı tarayıcı. Değerler uydurmadır.
import { expect, test } from '@playwright/test';
import { envanterOku, sayfaIciUyari, secimleriKesfet } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici } from './giris-fikstur';

const SAYFA = `<style>
  .perde{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:900}
  .kutu{position:absolute;left:200px;top:100px;width:360px;height:140px;background:#fff;z-index:1000;border:1px solid red}
  .gizli{display:none}
</style>
<main>
  <label for="esya">Eşya bedeli</label> <input id="esya" value="0">
  <label for="deprem">Ek seçenek</label> <input type="checkbox" id="deprem" name="deprem"
    onclick="if (this.checked && document.getElementById('esya').value === '0') { this.checked = false; ac('Eşya bedeli girilmeden bu seçenek seçilemez.'); }">
  <div id="eski" class="kutu" style="left:600px">Önceden açık bilgi <a href="#" onclick="return false">Tamam</a></div>
</main>
<div id="perde" class="perde gizli"></div>
<div id="uyari" class="kutu gizli"><b>Uyarı</b><p id="metin"></p><a href="#" id="tamam" onclick="kapat();return false;">Tamam</a></div>
<script>
  function ac(m){ document.getElementById('metin').textContent = m; document.getElementById('perde').classList.remove('gizli'); document.getElementById('uyari').classList.remove('gizli'); }
  function kapat(){ document.getElementById('perde').classList.add('gizli'); document.getElementById('uyari').classList.add('gizli'); window.kapandi = (window.kapandi || 0) + 1; }
</script>`;

test('keşif denemesinin açtığı uyarı penceresi kapatılır, metni nota yazılır; önceden açık pencereye dokunulmaz', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA);
    const temel = await envanterOku(page);
    const notlar: string[] = [];
    const git = async (): Promise<void> => { await page.setContent(SAYFA); };
    const kesifler = await secimleriKesfet(page, temel, notlar, git, async (p, ms) => { await p.waitForTimeout(Math.min(ms, 100)); }, 8);
    expect(kesifler.some((k) => k.secim.includes('deprem')), JSON.stringify(kesifler)).toBe(true);
    await expect(page.locator('#uyari')).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { kapandi?: number }).kapandi)).toBe(1);
    expect(notlar.join('\n')).toContain('Eşya bedeli girilmeden bu seçenek seçilemez.');
    await expect(page.locator('#eski')).toBeVisible();
  } finally { await tarayici.close(); }
});

test('Nöbetçi taraması: yalnız MESAJ penceresi kapatılır (kapatma dışında denetim yok); seçenek / bağlantı içeren akış penceresi kalır', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<style>.kutu{position:absolute;width:360px;height:140px;background:#fff;z-index:1000;border:1px solid}</style>
      <div id="akis" class="kutu" style="left:10px;top:10px">Kayıt no 1 <a href="#" id="kart">Kartla öde</a> <select><option>Peşin</option></select> <span class="close-button" onclick="this.parentNode.hidden=true">x</span></div>
      <div id="uyari" class="kutu" style="left:400px;top:200px">Tutar 0'dan küçük olamaz. <a href="#" onclick="this.parentNode.hidden=true;return false;">Tamam</a></div>`);
    expect(await page.evaluate(sayfaIciUyari, { yalnizMesaj: true as const })).toContain("Tutar 0'dan küçük olamaz");
    await expect(page.locator('#uyari')).toBeHidden();
    // Akış penceresinin kapatma düğmesi olsa da içinde bağlantı / liste var: dokunulmaz.
    expect(await page.evaluate(sayfaIciUyari, { yalnizMesaj: true as const })).toBeNull();
    await expect(page.locator('#akis')).toBeVisible();
  } finally { await tarayici.close(); }
});
