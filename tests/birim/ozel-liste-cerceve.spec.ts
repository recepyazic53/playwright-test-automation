// ÖZEL AÇILIR LİSTE + ÇERÇEVE (iframe) — gizli <select>'e bağlı görünür aramalı liste ve aynı kökenli iframe içindeki alanlar:
//  - sayfa envanteri iki alanı ve seçeneklerini bulur (ana sayfada, iframe içinde, iç içe iframe'de); başka kökenli iframe
//    "okunamadı" sayılır,
//  - otomatik tarama iframe alanlarını okur, iframe'in yazma isteğini iptal eder, başka kökenli iframe için not düşer,
//  - akış kaydı paneli iframe'deki alanları "Görülen alanlar"da listeler, dokunuşu ve düğmeyi / mesajı işaretler,
//  - kayıt → paket → model → koşu: koşucu özel listeden doğru seçeneği seçer (select.value doğrulanır), iframe içinde de;
//    bileşen tıklamaya yanıt vermezse gizli listeye yazılır.
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfalar (bağımlılık yok; küçük bir aramalı liste bileşeni sayfanın kendi betiğinde);
// tarayıcı DNS çözümlemez. Değerler SAHTEDİR. OZEL_LISTE_EKRAN_KLASORU verilirse panelin görüntüsü oraya da yazılır.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { akisTaslagi, akistanKayitEnvanteri, type AkisEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { akisiKaydet } from '../../scripts/platform/tarama/kayit-motoru';
import { kayitPaketiOlustur, taramaPaketiOlustur, type HamAlan, type PaketMetasi } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { KAYIT_PANELI_KIMLIGI, type TaramaGirdisi } from '../../scripts/platform/tarama/protokol.mjs';
import { ENVANTER_BETIGI, envanterOku, taramayiYurut } from '../../scripts/platform/tarama/tarama-motoru';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';

type Nesne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title><style>
body{font:14px system-ui;margin:16px} td{padding:4px 8px;vertical-align:top} .ozel-kap{position:relative;width:220px}
.ozel-kutu{border:1px solid #889;border-radius:4px;padding:4px 8px;cursor:pointer;background:#fff}
.ozel-acilir{position:absolute;z-index:5;left:0;right:0;background:#fff;border:1px solid #889;padding:4px}
.ozel-acilir ul{list-style:none;margin:4px 0 0;padding:0} .ozel-acilir li{padding:2px 4px;cursor:pointer} .ozel-acilir li:hover{background:#dde}
</style></head><body>${govde}</body></html>`
});

/**
 * Pencere içeriği: "Kullanıcı" (role=combobox + aria-controls deseni) ve "Yetki" (<select id>_chosen deseni, rolsüz liste) — ikisinde
 * de gerçek <select> display:none, yanında görünen kutu + arama kutusu + liste. bozuk=1: kutu tıklamaya yanıt vermez. oto=1: sayfa
 * açılınca arka planda bir POST dener (taramada iptal edilmeli).
 */
const PENCERE = `<h2>Kullanıcı seçimi</h2>
<table id="secim"><tr><td>Kullanıcı</td><td><select id="kullanici" name="kullanici"><option value="">Seçiniz…</option>
<option value="u1">Ayşe Yılmaz</option><option value="u2">Mehmet Demir</option><option value="u3">Zeynep Kaya</option></select></td></tr>
<tr><td>Yetki</td><td><select id="yetki" name="yetki" data-desen="kimlik"><option value="">Seçiniz…</option>
<option value="r">Okuma</option><option value="w">Yazma</option></select></td></tr></table>
<button type="button" id="kaydet">Kaydet</button>
<p id="sonuc"></p>
<script>
const bozuk = location.search.includes('bozuk=1');
function ozelListe(s) {
  s.style.display = 'none';
  const kimlikDeseni = s.dataset.desen === 'kimlik';
  const kap = document.createElement('div'); kap.className = 'ozel-kap';
  if (kimlikDeseni) kap.id = s.id + '_chosen';
  const kutu = document.createElement('div'); kutu.className = 'ozel-kutu'; kutu.tabIndex = 0; kutu.textContent = 'Seçiniz…';
  if (!kimlikDeseni) { kutu.setAttribute('role', 'combobox'); kutu.setAttribute('aria-controls', s.id + '-liste'); kutu.setAttribute('aria-expanded', 'false'); }
  const acilir = document.createElement('div'); acilir.className = 'ozel-acilir'; acilir.hidden = true;
  const ara = document.createElement('input'); ara.type = 'text'; ara.className = 'ozel-ara'; ara.placeholder = 'Ara';
  const ul = document.createElement('ul'); ul.id = s.id + '-liste';
  if (!kimlikDeseni) ul.setAttribute('role', 'listbox');
  for (const o of s.options) {
    if (!o.value) continue;
    const li = document.createElement('li'); li.dataset.value = o.value; li.textContent = o.text;
    if (!kimlikDeseni) li.setAttribute('role', 'option');
    li.addEventListener('click', () => {
      s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }));
      kutu.textContent = o.text; acilir.hidden = true; kutu.setAttribute('aria-expanded', 'false');
    });
    ul.append(li);
  }
  const suz = () => { for (const li of ul.children) li.hidden = !li.textContent.toLocaleLowerCase('tr').includes(ara.value.toLocaleLowerCase('tr')); };
  ara.addEventListener('input', suz);
  kutu.addEventListener('click', () => {
    if (bozuk) return;
    acilir.hidden = !acilir.hidden; kutu.setAttribute('aria-expanded', String(!acilir.hidden));
    if (!acilir.hidden) { ara.value = ''; suz(); ara.focus(); }
  });
  acilir.append(ara, ul); kap.append(kutu, acilir); s.after(kap);
}
ozelListe(document.getElementById('kullanici'));
ozelListe(document.getElementById('yetki'));
document.getElementById('kaydet').addEventListener('click', () => {
  document.getElementById('sonuc').textContent = 'Seçildi: ' + document.getElementById('kullanici').value + '/' + document.getElementById('yetki').value;
});
if (location.search.includes('oto=1')) fetch('/otomatik-kayit', { method: 'POST', body: 'x' }).catch(() => undefined);
</script>`;

class Uygulama {
  readonly postlar: string[] = [];
  disAdres = '';
  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yontem === 'POST') { this.postlar.push(i.yol); return { tur: 'text/plain', govde: 'tamam' }; }
    if (i.yol === '/pencere') return html('Pencere', PENCERE);
    if (i.yol === '/ana') {
      return html('Yönetim', `<h1>Yönetim</h1><label>Not <input id="not" name="not"></label>
<iframe id="pencere" src="/pencere?oto=1" title="Kullanıcı seçimi" style="width:560px;height:300px;border:1px solid #aab"></iframe>`);
    }
    if (i.yol === '/ic-ice') return html('İç içe', '<h1>Dış</h1><iframe id="dis-cerceve" src="/ana" style="width:640px;height:420px"></iframe>');
    if (i.yol === '/ana-dis') return html('Dış köken', `<h1>Dış köken</h1><label>Açıklama <input id="aciklama"></label><iframe id="baska" src="${this.disAdres}/pencere" style="width:560px;height:300px"></iframe>`);
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

let tarayici: Browser;
let uygulama: Uygulama;
let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
let disSunucu: Awaited<ReturnType<typeof yerelSunucu>>;
/** Akış kaydından çıkan (iframe içindeki alanlı) model. */
let kayitModeli: Nesne | null = null;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  uygulama = new Uygulama();
  disSunucu = await yerelSunucu(new Uygulama().isle);
  uygulama.disAdres = disSunucu.adres;
  sunucu = await yerelSunucu(uygulama.isle);
  tarayici = await korumaliTarayici();
});
test.afterAll(async () => {
  await tarayici?.close();
  await sunucu?.kapat();
  await disSunucu?.kapat();
});

const alanBul = (alanlar: HamAlan[], anahtar: string): HamAlan => {
  const a = alanlar.find((x) => x.anahtar === anahtar);
  if (!a) throw new Error(`${anahtar} yok: ${alanlar.map((x) => x.anahtar).join(', ')}`);
  return a;
};
const KULLANICILAR = [{ deger: '', metin: 'Seçiniz…' }, { deger: 'u1', metin: 'Ayşe Yılmaz' }, { deger: 'u2', metin: 'Mehmet Demir' }, { deger: 'u3', metin: 'Zeynep Kaya' }];

async function envanterSayfasi(yol: string): Promise<{ page: Page; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
  const page = await baglam.newPage();
  await page.addInitScript({ content: ENVANTER_BETIGI });
  await page.goto(yol, { waitUntil: 'load' });
  return { page, kapat: () => baglam.close() };
}

test('envanter: gizli <select> + görünür kutu alan olarak okunur (etiket, seçenekler, gerçek seçici); iframe içi ve iç içe iframe; başka köken okunamaz', async () => {
  const { page, kapat } = await envanterSayfasi('/pencere');
  try {
    const e = await envanterOku(page);
    expect(e.alanlar.map((a) => a.anahtar)).toEqual(['#kullanici', '#yetki']);
    expect(alanBul(e.alanlar, '#kullanici')).toMatchObject({
      tur: 'select', etiket: 'Kullanıcı', etiketKaynagi: 'yakin', secici: '#kullanici', kirilganlik: 'dusuk', ozelBilesen: true, secenekler: KULLANICILAR
    });
    expect(alanBul(e.alanlar, '#yetki')).toMatchObject({ etiket: 'Yetki', secici: '#yetki', ozelBilesen: true, bilesen: '#yetki_chosen' });
    expect(alanBul(e.alanlar, '#kullanici').cerceve).toBeUndefined();
    // Bileşenin kendi arama kutusu ve kutusu ayrı alan / "çıkarılamayan özel bileşen" sayılmaz.
    expect(e.ozelBilesenSayisi).toBe(0);
    expect(e.cerceveSayisi).toBe(0);

    await page.goto('/ana', { waitUntil: 'load' });
    const ana = await envanterOku(page);
    expect(ana.alanlar.map((a) => a.anahtar)).toEqual(['#not', 'iframe#pencere::#kullanici', 'iframe#pencere::#yetki']);
    expect(alanBul(ana.alanlar, 'iframe#pencere::#kullanici')).toMatchObject({ secici: '#kullanici', cerceve: ['iframe#pencere'], ozelBilesen: true, etiket: 'Kullanıcı', secenekler: KULLANICILAR });
    expect(ana).toMatchObject({ cerceveSayisi: 1, okunamayanCerceveSayisi: 0 });

    await page.goto('/ic-ice', { waitUntil: 'load' });
    const ic = await envanterOku(page);
    expect(alanBul(ic.alanlar, 'iframe#dis-cerceve::iframe#pencere::#yetki').cerceve).toEqual(['iframe#dis-cerceve', 'iframe#pencere']);
    expect(ic.cerceveSayisi).toBe(2);

    await page.goto('/ana-dis', { waitUntil: 'load' });
    const dis = await envanterOku(page);
    expect(dis.alanlar.map((a) => a.anahtar)).toEqual(['#aciklama']);
    expect(dis).toMatchObject({ cerceveSayisi: 1, okunamayanCerceveSayisi: 1 });
  } finally {
    await kapat();
  }
});

function girdi(yol: string, ek: Partial<TaramaGirdisi> = {}): TaramaGirdisi {
  return {
    tabanUrl: sunucu.adres, hedefAdres: `${sunucu.adres}${yol}`, hedefYol: yol, tarif: null, kimlik: null, profiller: [{ ad: null, degerler: null }],
    kesif: true, yasakKaliplari: ['*yasak-ornek*'], izinliKokenler: [sunucu.adres], zamanAsimiMs: 120_000, ...ek
  };
}

test('tarama: iframe alanları okunur (keşif gizli listede de çalışır), iframe\'in yazma isteği iptal edilir; başka kökenli iframe notu', async () => {
  test.setTimeout(90_000);
  const once = uygulama.postlar.length;
  const env = await taramayiYurut(tarayici, girdi('/ana'), async () => undefined);
  const p = env.profiller[0];
  expect(p.alanlar.map((a) => a.anahtar)).toEqual(['#not', 'iframe#pencere::#kullanici', 'iframe#pencere::#yetki']);
  expect(p.notlar).toEqual(expect.arrayContaining([expect.stringContaining("2 alan çerçeve (iframe) içinde okundu")]));
  // Güvenlik: iframe'in arka plan POST'u bağlam düzeyindeki engelden geçemedi (sunucuya ulaşmadı).
  expect(env.engellenenler).toEqual(expect.arrayContaining([expect.objectContaining({ yontem: 'POST', neden: 'yazma', asama: 'tarama' })]));
  expect(uygulama.postlar.slice(once)).toEqual([]);
  // Keşif gizli <select>'te de seçenekleri dener (sayfa değişmeden) ve ilk değere geri alır.
  const k = p.kesifler.find((x) => x.secim === 'iframe#pencere::#kullanici');
  expect(k).toMatchObject({ ilkDeger: '', geriAlindi: true });
  expect(k?.degerler.map((d) => [d.deger, d.hata ?? null])).toEqual([['u1', null], ['u2', null], ['u3', null]]);

  const dis = await taramayiYurut(tarayici, girdi('/ana-dis', { kesif: false, izinliKokenler: [sunucu.adres, disSunucu.adres] }), async () => undefined);
  expect(dis.profiller[0].alanlar.map((a) => a.anahtar)).toEqual(['#aciklama']);
  expect(dis.profiller[0].notlar).toEqual(expect.arrayContaining([expect.stringContaining('1 çerçevenin (iframe) içi okunamadı')]));
});

const META: PaketMetasi = { ekranAnahtari: 'kullanici-secimi', ekranAdi: 'Kullanıcı seçimi', urlYolu: '/ana', girisGerekli: false, girissiz: true, ikiAsamali: 'yok', baglamTuru: null };

test('akış kaydı: panel iframe\'deki özel listeleri "Görülen alanlar"da listeler, dokunuşu / düğmeyi / mesajı işaretler; paket modeli cerceve + ozelSecim taşır', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const kayit = akisiKaydet(tarayici, { ...girdi('/ana'), kip: 'kayit', kesif: false }, async () => undefined);
  kayit.catch(() => undefined);
  // Kayıt tarayıcısındaki hedef sayfa (panel yerleşince).
  let page: Page | null = null;
  for (const son = Date.now() + 30_000; !page && Date.now() < son;) {
    page = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().endsWith('/ana')) ?? null;
    if (!page) await new Promise((c) => setTimeout(c, 100));
  }
  if (!page) throw new Error('kayıt sayfası açılmadı');
  const panel = page.locator(`#${KAYIT_PANELI_KIMLIGI}`);
  await expect(panel.getByText(/Görülen alanlar \(\d+/)).toBeVisible({ timeout: 15_000 });
  const cerceve = page.frameLocator('#pencere');
  // Kullanıcı: kutuya tıkla, aramaya yaz, seçeneğe tıkla (role=option). Yetki: rolsüz liste, metne tıkla.
  await cerceve.locator('#secim .ozel-kutu').first().click();
  await cerceve.locator('.ozel-ara').first().fill('meh');
  await cerceve.getByRole('option', { name: 'Mehmet Demir' }).click();
  await cerceve.locator('#yetki_chosen .ozel-kutu').click();
  await cerceve.locator('#yetki_chosen li', { hasText: 'Yazma' }).click();
  await panel.getByRole('button', { name: 'Ekranı yeniden oku' }).click();
  const satir = (etiket: string) => panel.locator('label').filter({ hasText: new RegExp(`^${etiket} `) });
  for (const etiket of ['Kullanıcı', 'Yetki']) {
    await expect(satir(etiket)).toContainText('özel liste');
    await expect(satir(etiket)).toContainText('çerçevede');
    await expect(satir(etiket)).toContainText('dokundunuz');
    await expect(satir(etiket).getByRole('checkbox')).toBeChecked();
  }
  await expect(satir('Not')).not.toContainText('dokundunuz');
  // Düğme ve mesaj iframe içinde.
  await cerceve.locator('#kaydet').click();
  await expect(panel.getByText('Basılan düğmeler (1)')).toBeVisible();
  await expect(panel.getByText('“Kaydet”')).toBeVisible();
  await panel.getByRole('button', { name: 'Mesaj seç' }).click();
  await cerceve.locator('#sonuc').click();
  await expect(panel.getByText('Mesajlar (1)')).toBeVisible();
  await panelGoruntusu(page, testInfo);
  await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
  await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  const env: AkisEnvanteri = await kayit;

  const secili = env.alanlar.filter((a) => a.secili).map((a) => a.alan);
  expect(secili.map((a) => [a.anahtar, a.secici, a.cerceve, a.ozelBilesen])).toEqual([
    ['iframe#pencere::#kullanici', '#kullanici', ['iframe#pencere'], true], ['iframe#pencere::#yetki', '#yetki', ['iframe#pencere'], true]
  ]);
  expect(env.dugmeler).toEqual([{ secici: '#kaydet', metin: 'Kaydet', cerceve: ['iframe#pencere'] }]);
  expect(env.mesajlar).toEqual([{ secici: '#sonuc', metin: 'Seçildi: u2/w', cerceve: ['iframe#pencere'] }]);
  // Seçilen değerler (yalnız kayıtlı seçeneklerden) okumalara girdi; iframe'in açılan listesi seçenek gözlemi oldu.
  const okumalar = env.olaylar.flatMap((o) => (o.tur === 'okuma' ? [o.okuma] : o.tur === 'tik' ? [o.oncesi] : []));
  expect(okumalar.some((o) => o.secimler['iframe#pencere::#kullanici'] === 'u2' && o.secimler['iframe#pencere::#yetki'] === 'w')).toBe(true);
  // Seçenekler gizli <select>'ten (tam liste); aramayla süzülen açılır liste gözlem olarak alınmaz.
  const gozlemler = (env.secenekGozlemleri ?? []).filter((g) => g.anahtar === 'iframe#pencere::#kullanici');
  expect(gozlemler.length).toBeGreaterThan(0);
  expect(gozlemler.every((g) => g.kaynak === 'liste' && g.secenekler.length === 3)).toBe(true);

  // Taslak → kayıt envanteri → paket → model.
  const { envanter, hatalar } = akistanKayitEnvanteri(env, akisTaslagi(env));
  expect(hatalar).toEqual([]);
  const { paket } = kayitPaketiOlustur(META, envanter as NonNullable<typeof envanter>);
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  const m = paket.model as Nesne;
  const alanlar = m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar));
  expect(alanlar.find((a: Nesne) => a.id === 'kullanici')).toMatchObject({
    tip: 'secim', doldurucu: 'ozelSecim', konum: { secici: '#kullanici', cerceve: ['iframe#pencere'] }, secenekler: KULLANICILAR.slice(1)
  });
  expect(alanlar.find((a: Nesne) => a.id === 'yetki')).toMatchObject({ doldurucu: 'ozelSecim', konum: { secici: '#yetki', cerceve: ['iframe#pencere'] } });
  const kosu = m.adimlar[0].kosu;
  expect(kosu.aksiyonlar).toEqual([{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet', cerceve: ['iframe#pencere'] }]);
  expect(kosu.basariGostergesi).toEqual({ tur: 'metin', deger: 'Seçildi', secici: '#sonuc', cerceve: ['iframe#pencere'] });
  expect(JSON.stringify(paket)).not.toContain('u2/w');
  kayitModeli = m;
});

async function panelGoruntusu(page: Page, testInfo: TestInfo): Promise<void> {
  const panel = page.locator(`#${KAYIT_PANELI_KIMLIGI}`);
  const goruntu = await panel.screenshot();
  const tam = await page.screenshot();
  await testInfo.attach('akis-kaydi-paneli.png', { body: goruntu, contentType: 'image/png' });
  await testInfo.attach('akis-kaydi-sayfa.png', { body: tam, contentType: 'image/png' });
  const klasor = process.env.OZEL_LISTE_EKRAN_KLASORU;
  if (klasor) {
    mkdirSync(klasor, { recursive: true });
    await panel.screenshot({ path: join(klasor, 'akis-kaydi-paneli.png') });
    await page.screenshot({ path: join(klasor, 'akis-kaydi-sayfa.png') });
  }
}

const senaryo = (model: Nesne, veri: Nesne): PlatformModelSenaryosu => ({
  id: 'ozel-1', baslik: 'Özel liste', kosuyaDahil: true, ekran: { id: 'e1', anahtar: String(model.id), ad: String(model.ad) }, model, modelSurumu: 1, altModeller: {}, veri, mutlakaGorunmeli: []
});
async function kos(testInfo: TestInfo, model: Nesne, veri: Nesne): Promise<{ page: Page; hata: string | null; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
  const page = await baglam.newPage();
  const ortam: ModelKosuOrtami = {
    veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
    tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
  };
  let hata: string | null = null;
  try { await modelSenaryosunuKos(page, testInfo, senaryo(model, veri), ortam); } catch (e) { hata = (e as Error).message; }
  return { page, hata, kapat: () => baglam.close() };
}

test('koşu (iframe): kayıttan çıkan modelle koşucu iframe içindeki özel listelerden doğru seçenekleri seçer, düğmeye basar, mesajı görür', async ({}, testInfo) => {
  test.setTimeout(90_000);
  expect(kayitModeli, 'önceki test (akış kaydı) modeli üretmeliydi').not.toBeNull();
  const { page, hata, kapat } = await kos(testInfo, kayitModeli as Nesne, { kullanici: 'Zeynep Kaya', yetki: 'r' });
  try {
    expect(hata).toBeNull();
    const cerceve = page.frameLocator('#pencere');
    expect(await cerceve.locator('#kullanici').inputValue()).toBe('u3');
    expect(await cerceve.locator('#yetki').inputValue()).toBe('r');
    // Seçim görünen bileşenden yapıldı (kutu seçilen metni gösteriyor) ve düğmenin sonucu iframe'de.
    await expect(cerceve.locator('#secim .ozel-kutu').first()).toHaveText('Zeynep Kaya');
    await expect(cerceve.locator('#yetki_chosen .ozel-kutu')).toHaveText('Okuma');
    await expect(cerceve.locator('#sonuc')).toHaveText('Seçildi: u3/r');
  } finally {
    await kapat();
  }
});

test('koşu (ana sayfa): taramadan çıkan modelde ozelSecim; bileşen tıklamaya yanıt vermezse gizli listeye yazılır ve değer doğrulanır', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const env = await taramayiYurut(tarayici, girdi('/pencere', { kesif: false }), async () => undefined);
  const { paket } = taramaPaketiOlustur({ ...META, ekranAnahtari: 'pencere', ekranAdi: 'Pencere', urlYolu: '/pencere' }, env);
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  const m = paket.model as Nesne;
  const alanlar = m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar));
  expect(alanlar.map((a: Nesne) => [a.id, a.doldurucu, a.konum.cerceve ?? null])).toEqual([['kullanici', 'ozelSecim', null], ['yetki', 'ozelSecim', null]]);

  const normal = await kos(testInfo, m, { kullanici: 'u1', yetki: 'Yazma' });
  try {
    expect(normal.hata).toBeNull();
    expect(await normal.page.locator('#kullanici').inputValue()).toBe('u1');
    expect(await normal.page.locator('#yetki').inputValue()).toBe('w');
    await expect(normal.page.locator('#secim .ozel-kutu').first()).toHaveText('Ayşe Yılmaz');
  } finally {
    await normal.kapat();
  }

  const bozuk = await kos(testInfo, { ...m, ekranUrl: '/pencere?bozuk=1' }, { kullanici: 'u2', yetki: 'r' });
  try {
    expect(bozuk.hata).toBeNull();
    expect(await bozuk.page.locator('#kullanici').inputValue()).toBe('u2');
    expect(await bozuk.page.locator('#yetki').inputValue()).toBe('r');
  } finally {
    await bozuk.kapat();
  }

  // Listede olmayan değer: açık Beklenen / Görülen hatası.
  const yok = await kos(testInfo, m, { kullanici: 'u9', yetki: 'r' });
  try {
    expect(yok.hata).toBeTruthy();
  } finally {
    await yok.kapat();
  }
});

// ---- Saf (tarayıcısız): model doğrulayıcı ve mevcut modelle birleştirme ----
const ham = (id: string, ek: Partial<HamAlan> = {}): HamAlan => ({
  anahtar: `#${id}`, tur: 'select', etiket: id, etiketKaynagi: 'label', kimlik: id, ad: id, secici: `#${id}`, kirilganlik: 'dusuk', adaySeciciler: [`#${id}`],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'genel', baslik: 'Genel' },
  secenekler: [{ deger: 'a', metin: 'A' }, { deger: 'b', metin: 'B' }], ...ek
});
const kayitPaketi = (alanlar: HamAlan[], mevcutModel: Nesne | null = null): Nesne => kayitPaketiOlustur({ ...META, mevcutModel }, {
  kip: 'kayit', profil: null, adimlar: [{ ad: 'Seçim', yol: '/ana', baslik: 'Y', alanlar, ilerleme: { secici: '#kaydet', metin: 'Kaydet', cerceve: ['iframe#pencere'] } }],
  basariGostergesi: { secici: '#sonuc', metin: 'Tamam', aranan: null, cerceve: ['iframe#pencere'] }, engellenenler: [], notlar: []
}).paket;

test('doğrulayıcı: cerceve (1–2 seçici) ve ozelSecim (yalnız secim) kuralları; geçerli paket', () => {
  const paket = kayitPaketi([ham('kullanici', { anahtar: 'iframe#pencere::#kullanici', cerceve: ['iframe#pencere'], ozelBilesen: true })]);
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  const m = paket.model as Nesne;
  expect(m.adimlar[0].kosu).toEqual({
    aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet', cerceve: ['iframe#pencere'] }],
    basariGostergesi: { tur: 'eleman', deger: '#sonuc', cerceve: ['iframe#pencere'] }
  });
  const bozuk = (f: (m: Nesne) => void): string[] => {
    const p = JSON.parse(JSON.stringify(paket)) as Nesne;
    f(p.model);
    return sayfaPaketiniDogrula(p).hatalar.map((h: { mesaj: string }) => h.mesaj);
  };
  const alan = (m: Nesne): Nesne => m.adimlar[0].bolumler[0].alanlar[0];
  expect(bozuk((m) => { alan(m).konum.cerceve = []; }).join(' ')).toContain('"cerceve" 1–2');
  expect(bozuk((m) => { alan(m).konum.cerceve = ['a', 'b', 'c']; }).join(' ')).toContain('"cerceve" 1–2');
  expect(bozuk((m) => { alan(m).tip = 'metin'; delete alan(m).secenekler; }).join(' ')).toContain('ozelSecim doldurucusu yalnızca');
  expect(bozuk((m) => { m.adimlar[0].kosu.aksiyonlar[0].cerceve = 'iframe#pencere'; }).join(' ')).toContain('"cerceve"');
  expect(bozuk((m) => { m.adimlar[0].kosu.basariGostergesi = { tur: 'url', deger: 'x', cerceve: ['iframe#pencere'] }; }).join(' ')).toContain('"cerceve" yalnızca');
  expect(bozuk((m) => { m.adimlar[0].kosu.hataGostergesi = { secici: '#uyari', cerceve: ['iframe#pencere'] }; })).toEqual([]);
});

test('birleştirme: aynı seçici ana sayfada ve iframe\'de ayrı alanlardır; eşleşen alanda kullanıcının doldurucusu korunur, yoksa ozelSecim eklenir', () => {
  const ilk = kayitPaketi([ham('kullanici')]).model as Nesne;
  // Aynı seçici bu kez iframe içinde: mevcut (ana sayfadaki) alanla eşleşmez, yeni alan olur.
  const iframeli = kayitPaketi([ham('kullanici', { anahtar: 'iframe#pencere::#kullanici', cerceve: ['iframe#pencere'], ozelBilesen: true })], ilk).model as Nesne;
  const alanlar = (m: Nesne): Nesne[] => m.adimlar.flatMap((a: Nesne) => a.bolumler.flatMap((b: Nesne) => b.alanlar)).filter((a: Nesne) => a.tip === 'secim');
  expect(alanlar(iframeli).map((a) => [a.id, a.konum.cerceve ?? null, a.doldurucu ?? null])).toEqual([['kullanici2', ['iframe#pencere'], 'ozelSecim']]);
  // Ana sayfadaki alan özel listeye dönüştü: eşleşir, doldurucu eklenir; kullanıcı başka doldurucu seçtiyse korunur.
  const ozel = kayitPaketi([ham('kullanici', { ozelBilesen: true })], ilk).model as Nesne;
  expect(alanlar(ozel).map((a) => [a.id, a.doldurucu])).toEqual([['kullanici', 'ozelSecim']]);
  alanlar(ilk)[0].doldurucu = 'degerJs';
  const korunan = kayitPaketi([ham('kullanici', { ozelBilesen: true })], ilk).model as Nesne;
  expect(alanlar(korunan).map((a) => [a.id, a.doldurucu])).toEqual([['kullanici', 'degerJs']]);
});
