// "DEVAM ET" DÜĞME ADAYLARI — form denetimi parçaları aday DEĞİLDİR (etiketler, radyo / onay kutusu metinleri ve sarmalayıcıları, alan
// etiketi / başlık hücresi metinleri, select'e dayalı özel açılır liste kutuları ve öğeleri, yer tutucu ve seçili liste değeri
// gösterimleri); yalnız simgeli tıklanabilir öğeler adlarıyla (ve yakın alanın etiketiyle) aday olur; bağlantılar "baglanti" ile işaretlenir.
// Güvenlik: page.setContent (ağsız), korumalı tarayıcı; hiçbir öğeye basılmaz.
import { expect, test } from '@playwright/test';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import { eylemAdaylariniAyikla } from '../../scripts/platform/tarama/eylem-kesfi.mjs';
import { korumaliTarayici } from './giris-fikstur';

const SAYFA = `<style>
  .select2-hidden-accessible{border:0!important;clip:rect(0 0 0 0)!important;height:1px!important;margin:-1px!important;overflow:hidden!important;padding:0!important;position:absolute!important;width:1px!important}
  .select2-selection{display:inline-block;min-width:160px;border:1px solid #aaa;cursor:pointer;padding:4px}
  .select2-results__option{cursor:pointer;padding:2px 6px}
  .el{cursor:pointer}
  img, i.fa{display:inline-block;width:16px;height:16px;cursor:pointer;background:#ccc}
  [role=combobox].ozel{display:inline-block;border:1px solid;padding:4px;cursor:pointer}
  [role=option]{cursor:pointer}
</style>
<main><form id="f" onsubmit="return false">
<table>
  <tr><td><span class="el">Başvuran Tipi</span></td>
      <td><input type="radio" name="tip" id="tO" value="O"><label for="tO">Özel</label> <input type="radio" name="tip" id="tT" value="T"><label for="tT">Tüzel</label></td></tr>
  <tr><td><span class="el">Kişi Türü</span></td>
      <td><span class="sec"><input type="radio" name="tur" value="1"><span class="el" onclick="this.previousElementSibling.click()">Özel</span></span>
          <span class="sec"><input type="radio" name="tur" value="2"><span class="el" onclick="this.previousElementSibling.click()">Tüzel</span></span></td></tr>
  <tr><td><span class="el">Onay veriyor musunuz</span></td>
      <td><div class="iradio el" style="display:inline-block;width:18px;height:18px;position:relative"><input type="radio" name="onay" value="E" style="opacity:0;position:absolute"></div><span class="el">Evet</span>
          <div class="iradio el" style="display:inline-block;width:18px;height:18px;position:relative"><input type="radio" name="onay" value="H" style="opacity:0;position:absolute"></div><span class="el">Hayır</span></td></tr>
  <tr><th><span class="el">T.C. Kimlik Numarası</span></th>
      <td><input id="tc" name="tc"><img src="img/sorgula.png" alt="" onclick="void 0"></td></tr>
  <tr><td><span class="el">İl</span></td>
      <td><select id="il" class="select2-hidden-accessible" tabindex="-1" aria-hidden="true"><option value="">Seçiniz...</option><option value="06">ANKARA</option><option value="55">SAMSUN</option></select><span class="select2 select2-container" dir="ltr"><span class="selection"><span class="select2-selection select2-selection--single" role="combobox" tabindex="0" aria-haspopup="true" aria-expanded="true" aria-labelledby="select2-il-container" aria-owns="select2-il-results"><span class="select2-selection__rendered" id="select2-il-container" title="Seçiniz...">Seçiniz...</span><span class="select2-selection__arrow" role="presentation"><b role="presentation"></b></span></span></span></span></td></tr>
  <tr><td><span class="el">Başvuran İl</span></td>
      <td><select id="il2" class="select2-hidden-accessible" tabindex="-1" aria-hidden="true"><option value="">Seçiniz...</option><option value="55" selected>SAMSUN</option></select><span class="select2 select2-container" dir="ltr"><span class="selection"><span class="select2-selection select2-selection--single" role="combobox" tabindex="0" aria-labelledby="select2-il2-container"><span class="select2-selection__rendered" id="select2-il2-container" title="SAMSUN">SAMSUN</span></span></span></span></td></tr>
  <tr><td><span class="el">Meslek</span></td>
      <td><select id="meslek"><option value="">Lütfen seçin</option><option>Mühendis</option><option selected>Öğretmen</option></select> <span class="el">Öğretmen</span></td></tr>
</table>
<div><label for="adres">Adres Kodu</label> <input id="adres"><img src="img/refresh.gif" onclick="void 0"></div>
<div><label for="plaka">Plaka</label> <input id="plaka"> <a href="#"><i class="fa fa-search"></i></a></div>
<p><span class="el">Seçiniz</span></p>
<div id="etiket" class="ozel" role="combobox" tabindex="0" aria-expanded="true" aria-controls="etiketListe" aria-label="Etiket">Etiket seçin ▾</div>
<ul id="etiketListe" role="listbox"><li role="option">İş</li><li role="option">Kişisel</li></ul>
<p><input type="image" src="img/talep.png" alt="Talep al" width="40" height="20"></p>
<p><button type="button" id="hesapla">Hesapla</button> <a href="#" id="yardim">Yardım</a></p>
</form></main>
<span class="select2-container select2-container--open" style="position:absolute;left:10px;top:600px"><span class="select2-dropdown select2-dropdown--below"><span class="select2-results"><ul class="select2-results__options" role="listbox" id="select2-il-results"><li class="select2-results__option" role="option" id="select2-il-result-a-06">ANKARA</li><li class="select2-results__option" role="option" id="select2-il-result-a-55">SAMSUN</li></ul></span></span></span>`;

test('Devam et adayları: form parçaları çıkar, simgeler adlarıyla gelir, bağlantılar işaretlenir', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA);
    const e = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
    const metinler = e.gonderim.map((a) => a.metin ?? '');
    const bilgi = JSON.stringify(metinler);
    // Form parçaları yok.
    for (const yok of [/^Başvuran Tipi/, /^Kişi Türü/, /^Özel/, /^Tüzel/, /^Evet/, /^Hayır/, /Seçiniz/i, /^SAMSUN/, /^ANKARA/, /^T\.C\. Kimlik Numarası/, /^Öğretmen/, /^İl\b/, /^Onay veriyor/]) {
      expect(metinler.filter((m) => yok.test(m)), `${yok} — ${bilgi}`).toEqual([]);
    }
    // Simgeler adlarıyla ve yakın alanın etiketiyle.
    for (const var_ of ['Sorgula (T.C. Kimlik Numarası)', 'Yenile (Adres Kodu)', 'Ara (Plaka)', 'Hesapla', 'Yardım', 'Etiket seçin ▾', 'Kişisel']) {
      expect(metinler, `${var_} — ${bilgi}`).toContain(var_);
    }
    expect(metinler.some((m) => m.startsWith('Talep al')), bilgi).toBe(true);
    // Bağlantı işareti: yalnız "Yardım" bağlantıdır; simge bağlantısı ve düğmeler değil.
    const bul = (m: string) => e.gonderim.find((a) => a.metin === m);
    expect(bul('Yardım')?.baglanti).toBe(true);
    expect(bul('Hesapla')?.baglanti).toBe(false);
    expect(bul('Ara (Plaka)')?.baglanti).toBe(false);
    expect(e.gonderim.filter((a) => a.baglanti).map((a) => a.metin)).toEqual(['Yardım']);
    // Seçiciler tek ve doğru öğeyi bulur.
    expect(await page.locator(bul('Yenile (Adres Kodu)')?.secici as string).getAttribute('src')).toBe('img/refresh.gif');
    // Ayıklama (alt süreçten gelen küme) baglanti alanını korur.
    const ayik = eylemAdaylariniAyikla(JSON.parse(JSON.stringify({ ...e, gonderim: e.gonderim.filter((a) => a.metin === 'Yardım' || a.metin === 'Hesapla') })));
    expect(ayik?.gonderim.find((a) => a.metin === 'Yardım')?.baglanti).toBe(true);
    expect(ayik?.gonderim.find((a) => a.metin === 'Hesapla')?.baglanti).toBe(false);
  } finally { await tarayici.close(); }
});
