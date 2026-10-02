// POLİGON DÜZELTMELERİ 8, 10 ve ek bulgular — salt okunur takvim alanı (değer + olaylar, olmazsa takvimden gün), otomatik tamamlama
// (yaz → öneri → seç), düğmeyi örten açık liste (kapatılır; kapanmazsa açık ileti), beklemeyle (debounce) beliren alanlar otomatik
// basıştan önce sorulur, yalnız yeni / değişen alanlar yazılır, "yazıp Enter'a basın" alanı, dosya alanı açık iletiyle.
// Güvenlik: yalnız 127.0.0.1 (poligon / setContent), ayrı Nöbetçi + geçici veri kökü.
import { expect, test } from '@playwright/test';
import { oneridenYaz, takvimdenYaz } from '../../scripts/platform/tarama/alan-cikisi';
import { ortuyuKaldir } from '../../scripts/platform/tarama/guvenli-tiklama';
import { sayfadakiAlanlar } from '../../scripts/platform/tarama/sayfa-envanteri';
import { PLANLAR } from '../poligon/planlar';
import { ekranKos, poligonOrtami, type Nesne, type PoligonOrtami } from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';

test.describe.configure({ mode: 'serial' });
const plan = (kok: string) => {
  const p = PLANLAR.find((x) => x.kok === kok);
  if (!p) throw new Error(kok);
  return p;
};

test('envanter: salt okunur takvim alanı "takvimden", öneri listeli alan "oneri", "yazıp Enter\'a basın" alanı tus=Enter', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<main>
      <label for="giris">Giriş tarihi</label><input id="giris" readonly placeholder="Takvimden seçin">
      <label for="kod">Kayıt kodu</label><input id="kod" readonly value="X-1">
      <div><label for="nereden">Nereden</label><input id="nereden" autocomplete="off"><ul id="nl" role="listbox" hidden></ul></div>
      <label for="beceri">Beceriler (yazıp Enter'a basın)</label><input id="beceri">
    </main>`);
    const env = await page.evaluate(sayfadakiAlanlar, 0);
    const a = (id: string) => env.alanlar.find((x) => x.kimlik === id);
    expect(a('giris')).toMatchObject({ saltOkunur: true, takvimden: true });
    expect(a('kod')?.takvimden).toBeUndefined();
    expect(a('nereden')?.oneri).toBe(true);
    expect(a('beceri')?.tus).toBe('Enter');
  } finally { await tarayici.close(); }
});

test('takvimden yazma: değer + olaylar tutarsa biter; sayfa betikle verilen değeri silerse takvim açılır, ay ilerletilir, gün tıklanır', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<input id="t" readonly><div id="kap"></div><script>
      const t = document.getElementById('t'); let ay = 10;
      const AD = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
      // Betikle verilen değer kabul edilmez (yalnız takvimden): input olayı güvenilmezse alan boşaltılır.
      t.addEventListener('input', (o) => { if (!o.isTrusted) t.value = ''; });
      function ciz() {
        const k = document.getElementById('kap'); k.innerHTML = '<div class="takvim"><b>' + AD[ay - 1] + ' 2026</b> <button id="ileri" aria-label="Sonraki ay">›</button><div id="gunler"></div></div>';
        for (let g = 1; g <= 30; g++) { const b = document.createElement('button'); b.textContent = g; b.onclick = () => { t.value = String(g).padStart(2, '0') + '.' + String(ay).padStart(2, '0') + '.2026'; k.innerHTML = ''; }; document.getElementById('gunler').appendChild(b); }
        document.getElementById('ileri').onclick = () => { ay++; ciz(); };
      }
      t.onclick = ciz;
    </script>`);
    expect(await takvimdenYaz(page.locator('#t'), '12.12.2026', 5_000)).toBeNull();
    await expect(page.locator('#t')).toHaveValue('12.12.2026');
    // Sade sayfa: değer + olaylar yeter.
    await page.setContent('<input id="s" readonly>');
    expect(await takvimdenYaz(page.locator('#s'), '03.11.2026', 5_000)).toBeNull();
    await expect(page.locator('#s')).toHaveValue('03.11.2026');
    // Takvim açılmıyor ve değer tutmuyor: açık ileti.
    await page.setContent('<input id="y" readonly><script>document.getElementById("y").addEventListener("input", (o) => { if (!o.isTrusted) o.target.value = ""; });</script>');
    expect(await takvimdenYaz(page.locator('#y'), '03.11.2026', 5_000)).toMatch(/takvim açılmadı/);
  } finally { await tarayici.close(); }
});

test('öneriden yazma: yaz → öneri listesi → eşleşen öneri seçilir; eşleşme yoksa öneriler söylenir; liste açılmazsa "liste-yok"', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<div><input id="n" autocomplete="off"><ul id="l" role="listbox" hidden></ul></div><p id="secim"></p><script>
      const n = document.getElementById('n'), l = document.getElementById('l'); let z;
      n.addEventListener('input', () => { clearTimeout(z); document.getElementById('secim').textContent = ''; z = setTimeout(() => {
        l.innerHTML = ''; ['Kuzeykent (KZK)', 'Kuzeyova (KZO)'].filter((x) => x.toLowerCase().includes(n.value.toLowerCase())).forEach((x) => {
          const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = x;
          li.onmousedown = (o) => { o.preventDefault(); n.value = x; document.getElementById('secim').textContent = x; l.hidden = true; }; l.appendChild(li); });
        l.hidden = !l.children.length; }, 250); });
    </script>`);
    expect(await oneridenYaz(page.locator('#n'), 'Kuzeykent (KZK)', 5_000)).toBe('secildi');
    await expect(page.locator('#secim')).toHaveText('Kuzeykent (KZK)');
    expect(await oneridenYaz(page.locator('#n'), 'Batıkent', 5_000, 1_200)).toBe('liste-yok');
    expect(await oneridenYaz(page.locator('#n'), 'Kuzey', 5_000, 1_200)).toMatch(/Öneri listesinde “Kuzey” yok \(öneriler: Kuzeykent \(KZK\), Kuzeyova \(KZO\)\)/);
  } finally { await tarayici.close(); }
});

test('örten açık liste: Escape ile kapanan liste kapatılır; kapanmayan örtü açık iletiyle (ham zaman aşımı değil)', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<button id="ara" style="position:absolute;top:40px;left:20px;width:160px;height:40px">Uçuşları ara</button>
      <ul id="l" role="listbox" style="position:absolute;top:20px;left:0;width:300px;height:120px;background:#fff;margin:0"><li role="option">Kuzeykent (KZK)</li></ul>
      <script>document.addEventListener('keydown', (o) => { if (o.key === 'Escape') document.getElementById('l').hidden = true; });</script>`);
    await ortuyuKaldir(page, page.locator('#ara'), 'Uçuşları ara');
    await expect(page.locator('#l')).toBeHidden();
    await page.setContent(`<button id="ara" style="position:absolute;top:40px;left:20px;width:160px;height:40px">Uçuşları ara</button>
      <ul role="listbox" style="position:fixed;inset:0;background:#fff;margin:0"><li role="option">Kuzeykent (KZK)</li></ul>`);
    await expect(ortuyuKaldir(page, page.locator('#ara'), 'Uçuşları ara')).rejects.toThrow(/“Uçuşları ara” düğmesine basılamadı: başka bir öğe düğmeyi örtüyor \(listbox: “Kuzeykent \(KZK\)”\)/);
  } finally { await tarayici.close(); }
});

let po: PoligonOrtami;
test.describe('poligon', () => {
  test.beforeAll(async () => { test.setTimeout(120_000); po = await poligonOrtami(); });
  test.afterAll(async () => { await po?.kapat(); });

  test('otel: takvim alanları keşfedilir ve doldurulur; "Çocuk artır" sonrası liste, oda seçimi, misafir formu; yönlendirmeyle biter', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/otel'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ kesif: true, veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  });

  test('uçak: kalkış / varış öneriden seçilir (normal koşu da); aynı metinli "Seç" ayırt edilir; modal form; PNR', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/ucak'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
  });

  test('abonelik: beklemeyle beliren alanlar otomatik basıştan önce sorulur; radyonun ilk değeri senaryoda; aynı alan yeniden yazılmaz', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/abonelik'));
    expect(r.asamalar, JSON.stringify(r.bulgular)).toMatchObject({ veri: true, eylem: true, bitis: true, dogrulama: true, kayit: true, normal: true, sayac: true });
    // Bölge listesi her koşuda bir kez seçilir; veri duraklarında yeniden yazılmaz. (Adres bölümü doldurunca belirdiği için Bölge → İlçe →
    // Mahalle zinciri yerinde keşfedilir: o denemeler ilk doldurmadan — ilk "Açık adres"ten — öncedir; sonrasında Bölge yalnız doğrulama
    // koşusunda ve normal koşuda bir kez seçilir.)
    const hizli = r.doldurma.hizli as string[];
    expect(hizli.slice(hizli.indexOf('Açık adres')).filter((x) => x === 'Bölge').length, JSON.stringify(hizli)).toBeLessThanOrEqual(2);
  });

  test('iş başvurusu: "Beceriler" yaz + Enter ile eklenir; dosya alanı veri durağında doldurulmaz (açık not), eksik sayılmaz', async () => {
    test.setTimeout(400_000);
    const r = await ekranKos(po, plan('/basvuru'), { kayitYok: true });
    const hatalar = (r.hataSorulari as Nesne[]).flatMap((h) => h.metinler as string[]);
    expect(hatalar.some((m) => /En az bir beceri/.test(m)), JSON.stringify(hatalar)).toBe(false);
    const dosya = (r.veriDuraklari as Nesne[]).flatMap((d) => d.alanlar as Nesne[]).find((a) => a.tur === 'file');
    expect(dosya?.hata ?? null).toBeNull();
  });
});
