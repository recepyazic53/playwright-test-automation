// KORUMA TESTLERİ — EKRAN KEŞFİ (Nöbetçi taraması; tests/support/ekran-kesfi.ts): radyo ve kısa listenin her seçeneği (iç içe de)
// denenir, sayfa içi düğmelere basılır, beliren alanlar toplanır; kayıt oluşturabilecek düğmeye ve başka sayfaya giden bağlantıya
// basılmaz. Yalnız 127.0.0.1'deki sahte sayfa.
import { expect, test, type Browser } from '@playwright/test';
import { ekranKesfi } from '../support/ekran-kesfi';
import { korumaliTarayici, yerelSunucu, type FiksturYaniti } from './giris-fikstur';

test.describe('ekran keşfi (127.0.0.1)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  let kayit = 0;
  let baska = 0;
  const sayfa = (): FiksturYaniti => ({ tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Form</title></head><body>
<form onsubmit="return false">
<fieldset><legend>Sigortalı tipi</legend>
<label><input type="radio" name="tip" id="tip-o" value="O" checked> Özel</label>
<label><input type="radio" name="tip" id="tip-t" value="T"> Tüzel</label></fieldset>
<label for="tc">TC No</label><input id="tc">
<div id="vkn-kap" hidden><label for="vkn">Vergi No</label><input id="vkn">
<fieldset><legend>Şirket türü</legend><label><input type="radio" name="sirket" id="s-a" value="A" checked> Anonim</label><label><input type="radio" name="sirket" id="s-l" value="L"> Limited</label></fieldset>
<p id="ortak-kap" hidden><label for="ortak">Ortak sayısı</label><input id="ortak" type="number"></p></div>
<label for="kullanim">Kullanım</label><select id="kullanim"><option value="">Seçiniz</option><option value="1">Mesken</option><option value="2">İşyeri</option></select>
<p id="ciro-kap" hidden><label for="ciro">Yıllık ciro</label><input id="ciro" type="number"></p>
<p id="not-kap" hidden><label for="not">Hesap notu</label><input id="not"></p>
<a href="javascript:void(0)" id="hesapla">Prim Hesapla</a> <a href="/baska-sayfa" id="yardim">Yardım sayfası</a>
<button type="button" id="kaydet">Poliçeyi Kaydet</button>
</form>
<script>
for (const r of document.querySelectorAll('[name=tip]')) r.addEventListener('change', () => { document.getElementById('vkn-kap').hidden = !document.getElementById('tip-t').checked; });
for (const r of document.querySelectorAll('[name=sirket]')) r.addEventListener('change', () => { document.getElementById('ortak-kap').hidden = !document.getElementById('s-l').checked; });
document.getElementById('kullanim').addEventListener('change', (e) => { document.getElementById('ciro-kap').hidden = e.target.value !== '2'; });
document.getElementById('hesapla').addEventListener('click', () => { document.getElementById('not-kap').hidden = false; });
document.getElementById('kaydet').addEventListener('click', () => { fetch('/kaydet', { method: 'POST' }); });
</script></body></html>` });

  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i) => {
      if (i.yol === '/kaydet') { kayit++; return { tur: 'text/plain', govde: 'ok' }; }
      if (i.yol === '/baska-sayfa') { baska++; return { tur: 'text/plain', govde: 'başka' }; }
      return i.yol === '/form' ? sayfa() : { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  test('radyo ve kısa listenin her seçeneği (iç içe de) denenir, sayfa içi düğmeye basılır; beliren alanlar toplanır; kayıt düğmesine ve başka sayfaya giden bağlantıya basılmaz', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    try {
      const ac = async () => { await page.goto('/form'); };
      await ac();
      const k = await ekranKesfi(page, ac);
      const bul = (secici: string) => k.alanlar.find((a) => a.secici === secici || a.adaySeciciler.includes(secici));
      expect(bul('#tc')).toBeTruthy();
      expect(bul('#vkn')?.yol).toMatch(/Tüzel/);
      expect(bul('#ciro')?.yol).toMatch(/İşyeri/);
      // İç içe: Tüzel ile beliren radyonun "Limited" seçeneği de denenir.
      expect(bul('#ortak')?.yol).toMatch(/Tüzel › .*Limited/);
      // javascript: bağlantısı (Prim Hesapla) düğme gibi basılır; başka sayfaya giden bağlantıya basılmaz.
      expect(bul('#not')).toBeTruthy();
      expect(baska).toBe(0);
      expect(k.dugmeler.map((d) => d.metin)).toEqual(expect.arrayContaining(['Prim Hesapla', 'Poliçeyi Kaydet']));
      expect(kayit).toBe(0);
      expect(k.notlar.join(' ')).toContain('Poliçeyi Kaydet');
    } finally { await baglam.close(); }
  });
});
