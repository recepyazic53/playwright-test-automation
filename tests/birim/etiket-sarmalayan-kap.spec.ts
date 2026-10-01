// ETİKET BULMA — süsleme kütüphanelerinin iç içe kapları (sayfa-envanteri.ts > yakinMetin). Alanın adı ayrı bir sütunda ("satır: [ad
// sütunu] [kutu sütunu]"), kutu ise yalnız onu saran birkaç kat kabın içindedir. Nöbetçi ada ulaşmalı; üst satırdaki radyonun seçeneği
// ("Bireysel") ya da yandaki listenin seçili değeri ("BETONARME", "Seçiniz...") ad olarak alınmamalıdır. Aynı satırdaki ikinci kutu
// satırın adını "(2)" ekiyle alır. Sayfa 127.0.0.1 bile değil, yalnız setContent: hiçbir ağ isteği yok. Tüm metinler uydurmadır.
import { expect, test, type Browser } from '@playwright/test';
import { envanterOku } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici } from './giris-fikstur';

/** Kutu: üç kat saran kap (iç içe div; kendi yazısı yok). */
const kutu = (id: string): string => `<div class="sarma-dis"><div class="sarma-ic"><div><input type="text" id="${id}" name="${id}"></div></div></div>`;
/** Süslü açılır liste: görünen kutu (seçili değerin yazısı) + gizli gerçek liste. */
const susluListe = (id: string, secili: string): string => `<div class="sus-liste"><div><span>${secili}</span><a href="#" class="ac"></a></div>
  <ul style="display:none"><li><a href="#">Seçiniz...</a></li><li><a href="#">${secili}</a></li></ul>
  <select id="${id}" name="${id}" style="display:none"><option value="-1">Seçiniz...</option><option value="1" selected>${secili}</option></select></div>`;
// Yerleşim sayfadaki gibi: ad sütunu solda (geniş), kutular sağda; üst satırın radyo seçenekleri kutunun hemen üstüne düşer.
const SAYFA = `<!doctype html><html lang="tr"><head><style>
body{font:12px sans-serif;margin:10px}.satir{overflow:hidden;margin:2px 0}.ad{float:left;width:260px}.kutular{float:left}
.sarma-dis{display:inline-block}.sus-liste span{display:inline-block;width:150px;border:1px solid #999}label{margin:0 4px}
</style></head><body><form>
<div class="satir"><div class="ad"><span>Müşteri Tipi</span></div><div class="kutular">
  <span><input type="radio" id="tip-b" name="tip" value="B" checked></span> <label for="tip-b"> Bireysel</label>
  <span><input type="radio" id="tip-k" name="tip" value="K"></span> <label for="tip-k"> Kurumsal</label></div></div>
<div class="satir"><div class="ad"><span>Cep Telefonu</span></div><div class="kutular">${kutu('telKodu')} ${kutu('telNo')}</div></div>
<div class="satir"><div class="ad"><span>Yapı türü</span></div><div class="kutular">${susluListe('yapiTuru', 'BETONARME')}</div></div>
<div class="satir"><div class="ad"><span>Yapım Yılı</span></div><div class="kutular">${kutu('yapimYili')}</div></div>
<div class="satir"><div class="ad"> Daire No </div><div class="kutular">${susluListe('daire', 'Seçiniz...')}</div></div>
<div class="satir"><div class="ad"> Adres Kodu </div><div class="kutular">${kutu('adresKodu')} <a href="#"><img alt="" src="data:,"></a></div></div>
<p>Ad <input type="text" id="ad"> Soyad <input type="text" id="soyad"></p>
<p><label for="il">İl</label> <input type="text" id="il"> <input type="text" id="ilKodu"></p>
</form></body></html>`;

let tarayici: Browser;
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });

test('iç içe saran kaplar düzey sayılmaz: ad sütunundaki yazı bulunur; radyo seçeneği / listenin seçili değeri ad olmaz; ikinci kutu "(2)"', async () => {
  const sayfa = await (await tarayici.newContext()).newPage();
  await sayfa.setContent(SAYFA);
  const { alanlar } = await envanterOku(sayfa);
  const ad = (kimlik: string): string | null => alanlar.find((a) => a.kimlik === kimlik)?.etiket ?? null;
  expect({
    telKodu: ad('telKodu'), telNo: ad('telNo'), yapimYili: ad('yapimYili'), adresKodu: ad('adresKodu'),
    ad: ad('ad'), soyad: ad('soyad'), ilKodu: ad('ilKodu'), tip: alanlar.find((a) => a.tur === 'radio')?.etiket
  }).toEqual({
    telKodu: 'Cep Telefonu', telNo: 'Cep Telefonu (2)', yapimYili: 'Yapım Yılı', adresKodu: 'Adres Kodu',
    ad: 'Ad', soyad: 'Soyad', ilKodu: 'İl (2)', tip: 'Müşteri Tipi'
  });
});
