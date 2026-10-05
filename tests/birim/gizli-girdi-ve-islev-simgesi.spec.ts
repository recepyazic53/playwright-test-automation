// ÖZEL ÇİZİMLİ FORM PARÇALARI — (1) gerçek onay kutusu / radyo girdisi gizli, yanında kutuyu çizen küçük bir öğe var (etiket yok):
// alan görünür sayılır, etiketi satırdan okunur, "gizliGirdi" işaretlenir ve betikle tıklanınca durum değişir. (2) Alanın yanındaki
// yazısız simge bağlantısının adı sınıf / dosya adından tanınmasa da çağırdığı işlevden çıkar (CheckIdentity → Sorgula); böyle bir simge
// "Alan ikonu" sayılmaz (keşifte basılır, adım adımda işlem adayıdır). Güvenlik: page.setContent (ağsız), korumalı tarayıcı.
import { expect, test } from '@playwright/test';
import { sayfadakiAlanlar } from '../../scripts/platform/tarama/sayfa-envanteri';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import { korumaliTarayici } from './giris-fikstur';

const SAYFA = `<style>
  .gizli{display:none}
  .kutu{display:inline-block;width:19px;height:19px;border:1px solid #888}
  .satir{display:flex;gap:8px;margin:4px}
  img{display:inline-block;width:16px;height:16px;background:#ccc}
</style>
<main>
  <div class="satir"><div class="sol"><span class="etiket">Kimlik Numarası</span></div>
    <div class="sag"><div class="sarmal"><div><input id="kimlik" name="kimlik" maxlength="11"></div></div>
      <a href="javascript:KimlikDenetle('SIGORTALI')"><img src="img/icon_update.png"></a></div></div>
  <div class="satir"><div class="sol"><span class="etiket">Eşya (Deprem)</span></div>
    <div class="sag"><span class="sarmal"><a href="#" class="kutu" onclick="var i=this.nextElementSibling;i.click();this.textContent=i.checked?'✓':'';return false;"></a><input type="checkbox" id="C1" name="C1" value="CHECKED" class="gizli" onclick="document.getElementById('durum').textContent=this.checked?'açık':'kapalı'"></span></div></div>
  <div class="satir"><div class="sol"><span class="etiket">Görünür kutu</span></div>
    <div class="sag"><input type="checkbox" id="C2" name="C2"></div></div>
  <p id="durum">kapalı</p>
</main>
<script>function KimlikDenetle(){} function Ac(){} function CheckIdentity(){}</script>`;

test('gizli girdili onay kutusu alan olur (etiketi satırdan, gizliGirdi); görünür kutu işaretlenmez; betikle tıklanınca durum değişir', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA);
    const env = await page.evaluate(sayfadakiAlanlar, 0);
    const c1 = env.alanlar.find((a) => a.kimlik === 'C1');
    const c2 = env.alanlar.find((a) => a.kimlik === 'C2');
    expect(c1, JSON.stringify(env.alanlar.map((a) => [a.kimlik, a.etiket]))).toMatchObject({ tur: 'checkbox', etiket: 'Eşya (Deprem)', gizliGirdi: true });
    expect(c2?.gizliGirdi).toBeUndefined();
    // Hızlı test / normal koşu gizli girdiyi betikle tıklar: sayfanın kendi işleyicisi çalışır.
    const l = page.locator(c1?.secici as string);
    await l.evaluate((e) => (e as HTMLInputElement).click());
    expect(await l.isChecked()).toBe(true);
    await expect(page.locator('#durum')).toHaveText('açık');
  } finally { await tarayici.close(); }
});

test('alan yanındaki adı tanınmayan simge çağırdığı işlevden adlanır ve işlem adayıdır (alan ikonu değil)', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA.replace("KimlikDenetle('SIGORTALI')", "Ac('X')").replace('img/icon_update.png', 'img/x.png'));
    const e = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
    const bilgi = JSON.stringify(e.gonderim.map((a) => [a.metin, a.alanIkonu ?? false]));
    const s = e.gonderim.find((a) => (a.metin ?? '').includes('Kimlik Numarası'));
    // Ac(…) ve x.png hiçbir ipucu vermez; ad tanınmasa da işlev çağıran simge alan ikonu sayılmaz.
    expect(s, bilgi).toBeTruthy();
    expect(s?.alanIkonu, bilgi).toBeFalsy();
  } finally { await tarayici.close(); }
});

test('CheckIdentity çağıran güncelle simgesi "Sorgula (alan)" olarak adlanır', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA.replace("KimlikDenetle('SIGORTALI')", "CheckIdentity('INSURED')"));
    const e = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
    const bilgi = JSON.stringify(e.gonderim.map((a) => a.metin));
    const s = e.gonderim.find((a) => a.metin === 'Sorgula (Kimlik Numarası)');
    expect(s, bilgi).toBeTruthy();
    expect(s?.alanIkonu).toBeFalsy();
  } finally { await tarayici.close(); }
});
