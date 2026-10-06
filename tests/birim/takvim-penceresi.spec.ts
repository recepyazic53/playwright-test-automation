// TAKVİM PENCERESİ — açılmış takvim (tarih seçici kütüphanesinin kendi kabı) içindeki yıl / ay listeleri ve ileri / geri okları ekranın
// alanı ya da eylemi değildir (sayfa-envanteri.ts, eylem-kesfi-motoru.ts). Tarih kutusunun kendisi alan olarak kalır. Yalnız setContent:
// hiçbir ağ isteği yok. Tüm metinler uydurmadır.
import { expect, test } from '@playwright/test';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import { envanterOku } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici } from './giris-fikstur';

const SAYFA = `<!doctype html><html lang="tr"><body><form>
<p><label for="tarih">Tescil Tarihi</label> <input type="text" id="tarih" class="hasDatepicker" value="01.10.2026"></p>
<p><label for="tip">Araç Tipi</label> <select id="tip"><option value="">Seçiniz</option><option value="1">ÖZEL</option></select></p>
<p><button type="button" id="hesapla">Prim Hesapla</button></p>
</form>
<div id="ui-datepicker-div" class="ui-datepicker ui-widget" style="position:absolute;top:40px;left:200px;z-index:10;display:block;background:#fff">
  <div class="ui-datepicker-header"><a class="ui-datepicker-prev" title="Geri" href="#">Geri</a><a class="ui-datepicker-next" title="İleri" href="#">İleri</a>
    <div class="ui-datepicker-title"><select class="ui-datepicker-month"><option value="8">Eyl</option><option value="9" selected>Eki</option></select>
    <select class="ui-datepicker-year"><option>2025</option><option selected>2026</option></select></div></div>
  <table class="ui-datepicker-calendar"><tbody><tr><td><a href="#">1</a></td><td><a href="#">2</a></td></tr></tbody></table>
  <div class="ui-datepicker-buttonpane"><button type="button">Bugün</button><button type="button">Kapat</button></div>
</div></body></html>`;

test('açık takvim penceresindeki yıl / ay listeleri alan, ileri / geri / gün / Bugün aday olmaz; tarih kutusu ve ekranın düğmesi kalır', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA);
    const { alanlar } = await envanterOku(page);
    expect(alanlar.map((a) => a.etiket)).toEqual(['Tescil Tarihi', 'Araç Tipi']);
    const e = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
    const metinler = e.gonderim.map((a) => a.metin ?? '');
    expect(metinler).toContain('Prim Hesapla');
    for (const yok of ['Geri', 'İleri', 'Bugün', 'Kapat', '1', '2']) expect(metinler, JSON.stringify(metinler)).not.toContain(yok);
  } finally { await tarayici.close(); }
});
