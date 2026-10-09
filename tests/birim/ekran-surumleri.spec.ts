// KORUMA TESTLERİ — EKRAN SÜRÜMLERİ (Nöbetçi taraması; scripts/platform/ekranlar/ekran-surumleri.mjs, tests/support/ekran-kesfi.ts).
// Karşılaştırma bir önceki ekran sürümüyle: gelen / kaybolan alan, seçenek ve düğme; gezilmeyen yer (keşif yapılmadı, adıma
// ulaşılmadı, başka senaryo) kaybolan sayılmaz ve yeni sürüme taşınır; bağlı listenin seçenekleri karşılaştırılmaz. Keşif: radyo ve kısa
// listenin her seçeneği denenir, beliren alanlar toplanır; kayıt oluşturabilecek düğmeye basılmaz. Yalnız 127.0.0.1'deki sahte sayfa.
import { expect, test, type Browser } from '@playwright/test';
import { KESIF, okumadanSurum, surumFarki } from '../../scripts/platform/ekranlar/ekran-surumleri.mjs';
import { ekranKesfi } from '../support/ekran-kesfi';
import { korumaliTarayici, yerelSunucu, type FiksturYaniti } from './giris-fikstur';

type Nesne = Record<string, any>;
const alan = (secici: string, etiket: string, ek: Nesne = {}): Nesne => ({ secici, etiket, tur: 'text', adaySeciciler: [secici], ...ek });
const secim = (secici: string, etiket: string, secenekler: string[]): Nesne =>
  alan(secici, etiket, { tur: 'select', secenekler: [{ deger: '', metin: 'Seçiniz' }, ...secenekler.map((m, i) => ({ deger: String(i + 1), metin: m }))] });

test('ilk okuma ekran sürümü olur; keşif ve senaryo adımı yerleri tutulur', () => {
  const y = okumadanSurum({
    kesif: { alanlar: [alan('#ad', 'Ad'), secim('#tip', 'Tip', ['Özel', 'Tüzel'])], dugmeler: [{ metin: 'Hesapla', secici: '#h' }, { metin: 'Yardım', secici: 'a', baglanti: true }] },
    gozlemler: [{ adimId: 'adim1', baslik: 'Bilgiler', alanlar: [alan('#ad', 'Ad'), alan('#adres', 'Adres')], dugmeler: [] }]
  }, 's1');
  expect(y.kesifYapildi).toBe(true);
  expect(y.gecilenAdimlar).toEqual(['adim1']);
  expect(Object.values(y.surum.alanlar).map((a) => a.etiket)).toEqual(['Ad', 'Tip', 'Adres']);
  expect(y.surum.alanlar['#ad|[]'].nerede).toEqual([KESIF, 'adim1']);
  expect(y.surum.alanlar['#tip|[]'].secenekler?.map((s) => s.metin)).toEqual(['Özel', 'Tüzel']);
  expect(Object.keys(y.surum.dugmeler)).toEqual(['hesapla']);
});

test('karşılaştırma: gelen / kaybolan alan, seçenek ve düğme; gezilmeyen yer kaybolan sayılmaz, yeni sürüme taşınır', () => {
  const onceki = okumadanSurum({
    kesif: { alanlar: [alan('#ad', 'Ad'), alan('#faks', 'Faks'), secim('#tip', 'Tip', ['Özel', 'Tüzel'])], dugmeler: [{ metin: 'Hesapla', secici: '#h' }, { metin: 'Yazdır', secici: '#y' }] },
    gozlemler: [
      { adimId: 'adim1', baslik: 'Bilgiler', alanlar: [alan('#adres', 'Adres')], dugmeler: [] },
      { adimId: 'adim2', baslik: 'Ödeme', alanlar: [alan('#kart', 'Kart')], dugmeler: [] }
    ]
  }, 's1').surum;
  // Bu tarama: keşif yapıldı; Faks yok, E-posta geldi, Tip'e Pasaport eklendi, Yazdır gitti, Kaydet geldi; Ödeme adımına ulaşılmadı.
  const yeni = okumadanSurum({
    kesif: { alanlar: [alan('#ad', 'Ad'), alan('#eposta', 'E-posta'), secim('#tip', 'Tip', ['Özel', 'Tüzel', 'Pasaport'])], dugmeler: [{ metin: 'Hesapla', secici: '#h' }, { metin: 'Kaydet', secici: '#k' }] },
    gozlemler: [{ adimId: 'adim1', baslik: 'Bilgiler', alanlar: [alan('#adres', 'Adres')], dugmeler: [] }]
  }, 's1');
  const f = surumFarki(onceki, yeni, 's1');
  expect(f.degisiklikler.map((d) => `${d.tur}: ${d.baslik}`).sort()).toEqual([
    'gelenAlan: E-posta', 'gelenDugme: Kaydet', 'kaybolanAlan: Faks', 'kaybolanDugme: Yazdır', 'yeniSecenek: Tip: Pasaport'
  ].sort());
  // Ulaşılmayan adımın alanı (Kart) kaybolan sayılmaz, yeni sürümde korunur.
  expect(f.surum.alanlar['#kart|[]']?.etiket).toBe('Kart');
  expect(f.surum.alanlar['#faks|[]']).toBeUndefined();
});

test('başka senaryoyla görülen alan bu senaryoda görünmezse kaybolan sayılmaz; keşif yapılamadıysa keşif alanları korunur', () => {
  const onceki = okumadanSurum({ gozlemler: [{ adimId: 'adim1', baslik: 'Bilgiler', alanlar: [alan('#vkn', 'Vergi No')], dugmeler: [] }] }, 'tuzel').surum;
  const ozel = okumadanSurum({ gozlemler: [{ adimId: 'adim1', baslik: 'Bilgiler', alanlar: [alan('#tc', 'TC No')], dugmeler: [] }] }, 'ozel');
  const f = surumFarki(onceki, ozel, 'ozel');
  expect(f.degisiklikler.map((d) => d.tur)).toEqual(['gelenAlan']);
  expect(f.surum.alanlar['#vkn|[]']?.etiket).toBe('Vergi No');
  // Aynı senaryo (tuzel) aynı adıma geldi ve Vergi No yok → kaybolan.
  const tuzel = okumadanSurum({ gozlemler: [{ adimId: 'adim1', baslik: 'Bilgiler', alanlar: [], dugmeler: [] }] }, 'tuzel');
  expect(surumFarki(f.surum, tuzel, 'tuzel').degisiklikler.map((d) => `${d.tur}: ${d.baslik}`)).toEqual(['kaybolanAlan: Vergi No']);
  // Keşif yapılamadı: keşifte görülen alan kaybolan sayılmaz.
  const kesifli = okumadanSurum({ kesif: { alanlar: [alan('#ad', 'Ad')], dugmeler: [] }, gozlemler: [] }, 'ozel').surum;
  expect(surumFarki(kesifli, okumadanSurum({ kesif: null, gozlemler: [{ adimId: 'adim1', baslik: 'B', alanlar: [], dugmeler: [] }] }, 'ozel'), 'ozel').degisiklikler).toEqual([]);
});

test('bağlı liste (okumalar arasında seçenekleri değişen) seçenek farkı vermez; yer tutucu seçenek sayılmaz', () => {
  const onceki = okumadanSurum({ kesif: { alanlar: [secim('#ilce', 'İlçe', ['A', 'B']), { ...secim('#sube', 'Şube', ['X']), degisken: true }], dugmeler: [] } }, 's1').surum;
  const yeni = okumadanSurum({ kesif: { alanlar: [secim('#ilce', 'İlçe', ['A', 'B']), secim('#sube', 'Şube', ['Y', 'Z'])], dugmeler: [] } }, 's1');
  expect(surumFarki(onceki, yeni, 's1').degisiklikler).toEqual([]);
  // Aynı taramada farklı seçeneklerle görülen liste de bağlı listedir.
  const iki = okumadanSurum({ kesif: { alanlar: [secim('#il', 'İl', ['1'])], dugmeler: [] }, gozlemler: [{ adimId: 'a', baslik: 'A', alanlar: [secim('#il', 'İl', ['1', '2'])], dugmeler: [] }] }, 's1');
  expect(iki.surum.alanlar['#il|[]'].degisken).toBe(true);
});

test.describe('ekran keşfi (127.0.0.1)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  let kayit = 0;
  const sayfa = (): FiksturYaniti => ({ tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Form</title></head><body>
<form onsubmit="return false">
<fieldset><legend>Sigortalı tipi</legend>
<label><input type="radio" name="tip" id="tip-o" value="O" checked> Özel</label>
<label><input type="radio" name="tip" id="tip-t" value="T"> Tüzel</label></fieldset>
<label for="tc">TC No</label><input id="tc">
<p id="vkn-kap" hidden><label for="vkn">Vergi No</label><input id="vkn"></p>
<label for="kullanim">Kullanım</label><select id="kullanim"><option value="">Seçiniz</option><option value="1">Mesken</option><option value="2">İşyeri</option></select>
<p id="ciro-kap" hidden><label for="ciro">Yıllık ciro</label><input id="ciro" type="number"></p>
<p id="not-kap" hidden><label for="not">Hesap notu</label><input id="not"></p>
<button type="button" id="hesapla">Prim Hesapla</button>
<button type="button" id="kaydet">Poliçeyi Kaydet</button>
</form>
<script>
for (const r of document.querySelectorAll('[name=tip]')) r.addEventListener('change', () => { document.getElementById('vkn-kap').hidden = !document.getElementById('tip-t').checked; });
document.getElementById('kullanim').addEventListener('change', (e) => { document.getElementById('ciro-kap').hidden = e.target.value !== '2'; });
document.getElementById('hesapla').addEventListener('click', () => { document.getElementById('not-kap').hidden = false; });
document.getElementById('kaydet').addEventListener('click', () => { fetch('/kaydet', { method: 'POST' }); });
</script></body></html>` });

  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i) => {
      if (i.yol === '/kaydet') { kayit++; return { tur: 'text/plain', govde: 'ok' }; }
      return i.yol === '/form' ? sayfa() : { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  test('radyo ve kısa listenin her seçeneği denenir, düğmeye basılır; beliren alanlar toplanır; kayıt düğmesine basılmaz', async () => {
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
      expect(bul('#not')?.yol).toMatch(/Prim Hesapla/);
      expect(k.dugmeler.map((d) => d.metin)).toEqual(expect.arrayContaining(['Prim Hesapla', 'Poliçeyi Kaydet']));
      expect(kayit).toBe(0);
      expect(k.notlar.join(' ')).toContain('Poliçeyi Kaydet');
    } finally { await baglam.close(); }
  });
});
