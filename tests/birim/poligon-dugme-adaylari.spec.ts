// POLİGON DÜZELTMELERİ 5, 6, 9 — gölge DOM (açık gölge kökleri: alanlar ve düğmeler), aynı kökenli çerçevedeki düğme ve zengin metin
// alanı (contenteditable), düğme adayları (addEventListener'lı div / svg, role=switch / option / tab, simge düğmede erişilebilir ad, aynı
// adlılar yakın yazıyla). Güvenlik: yalnız 127.0.0.1 (poligon / setContent), ayrı Nöbetçi + geçici veri kökü.
import { expect, test } from '@playwright/test';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import { sayfadakiAlanlar } from '../../scripts/platform/tarama/sayfa-envanteri';
import { PLANLAR } from '../poligon/planlar';
import { ekranKos, poligonOrtami, type PoligonOrtami } from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';

test.describe.configure({ mode: 'serial' });
const plan = (kok: string) => {
  const p = PLANLAR.find((x) => x.kok === kok);
  if (!p) throw new Error(kok);
  return p;
};

test('gölge DOM ve zengin metin: alanlar etiketleriyle okunur, seçicileri tek ve doldurulabilir; gölgedeki düğme aday', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<main><h1>Kayıt</h1><x-alan etiket="Ad soyad" ad="adSoyad"></x-alan><x-alan etiket="E-posta" ad="eposta"></x-alan>
      <label id="aE">Açıklama</label><div id="aciklama" contenteditable="true" role="textbox" aria-labelledby="aE" style="min-height:40px;border:1px solid"></div>
      <x-dugme></x-dugme></main>
      <script>
        customElements.define('x-alan', class extends HTMLElement { connectedCallback() { const k = this.attachShadow({ mode: 'open' });
          k.innerHTML = '<label for="i">' + this.getAttribute('etiket') + '</label><input id="i" name="' + this.getAttribute('ad') + '">'; } });
        customElements.define('x-dugme', class extends HTMLElement { connectedCallback() { const k = this.attachShadow({ mode: 'open' });
          k.innerHTML = '<button type="button">Kaydol</button>'; } });
      </script>`);
    const env = await page.evaluate(sayfadakiAlanlar, 0);
    const ad = env.alanlar.find((a) => a.etiket === 'Ad soyad');
    const eposta = env.alanlar.find((a) => a.etiket === 'E-posta');
    const zengin = env.alanlar.find((a) => a.etiket === 'Açıklama');
    expect(ad?.secici).toBe('input[name="adSoyad"]');
    expect(eposta?.anahtar).not.toBe(ad?.anahtar);
    expect(zengin).toMatchObject({ tur: 'contenteditable', secici: '#aciklama' });
    await page.locator(ad?.secici as string).fill('Deneme Kişi');
    await page.locator(zengin?.secici as string).fill('Uzun açıklama metni');
    expect(await page.evaluate(() => (document.querySelector('x-alan') as HTMLElement).shadowRoot?.querySelector('input')?.value)).toBe('Deneme Kişi');
    const eylem = await eylemAdaylariniCikar(page, { dugmeSiniri: 30 });
    expect(eylem.gonderim.map((a) => a.metin)).toContain('Kaydol');
  } finally { await tarayici.close(); }
});

test('düğme adayları: addEventListener\'lı div ve svg, role=switch / option, simge düğmede aria-label, aynı adlılar yakın yazıyla / sırayla', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<style>.y svg{width:30px;height:30px;cursor:pointer}.g{cursor:pointer;display:inline-block;padding:8px}</style><main>
      <p>Genel puanınız</p><div class="y">${[1, 2, 3].map(() => '<svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10"/></svg>').join('')}</div>
      <div class="g" id="gonder">Anketi gönder</div>
      <div><span id="sA">SMS bildirimleri</span><button role="switch" aria-checked="false" aria-labelledby="sA"></button></div>
      <ul role="listbox"><li role="option">Kişisel</li><li role="option">Acil</li></ul>
      <div class="u"><span>Kablosuz kulaklık</span><span><button aria-label="Adedi artır">+</button></span></div>
      <div class="u"><span>Telefon kılıfı</span><span><button aria-label="Adedi artır">+</button></span></div>
      <div><span>Yetişkin</span><button aria-label="Yetişkin artır">+</button></div>
    </main><script>document.querySelectorAll('.y svg').forEach(function(s){ s.addEventListener('click', function(){}); });
      document.getElementById('gonder').addEventListener('click', function(){});</script>`);
    const e = await eylemAdaylariniCikar(page, { dugmeSiniri: 40 });
    const metinler = e.gonderim.map((a) => a.metin);
    for (const m of ['Anketi gönder', 'SMS bildirimleri', 'Kişisel', 'Acil', 'Yetişkin artır', 'Genel puanınız (1/3)', 'Genel puanınız (2/3)', 'Adedi artır (Kablosuz kulaklık)', 'Adedi artır (Telefon kılıfı)']) {
      expect(metinler, m).toContain(m);
    }
    // Seçiciler tek ve doğru öğeyi bulur.
    const ikinci = e.gonderim.find((a) => a.metin === 'Genel puanınız (2/3)');
    expect(await page.locator(ikinci?.secici as string).count()).toBe(1);
  } finally { await tarayici.close(); }
});

let po: PoligonOrtami;
test.describe('poligon', () => {
  test.beforeAll(async () => { test.setTimeout(120_000); po = await poligonOrtami(); });
  test.afterAll(async () => { await po?.kapat(); });

  test('etkinlik (gölge DOM): alanlar keşfedilir, gölgedeki "Kaydol" basılır; onay kutusuyla beliren gölge "Vergi no" sorulur; baştan sona', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/etkinlik'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ kesif: true, veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  });

  test('destek (iframe + contenteditable): çerçevedeki "Bileti oluştur" aday, "Açıklama" sorulur ve doldurulur; baştan sona', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/destek'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ kesif: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  });

  test('anket (svg yıldız + div düğme): yıldız ve "Anketi gönder" adaylar; düşük puanda beliren zorunlu alan sorulur; baştan sona', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/anket'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  });

  test('ayarlar (role=switch) ve not (role=option, simge düğme): zincir tamamlanır, gerçek gönderimle doğrulanır', async () => {
    test.setTimeout(600_000);
    for (const kok of ['/ayarlar', '/not']) {
      const r = await ekranKos(po, plan(kok));
      expect(r.asamalar, `${kok}: ${JSON.stringify(r.bulgular)}`).toMatchObject({ eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
    }
  });
});
