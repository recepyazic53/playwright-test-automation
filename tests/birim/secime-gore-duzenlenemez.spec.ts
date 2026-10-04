// SEÇİME GÖRE DÜZENLENEMEYEN ALANLAR (hızlı test). Gerçek ekranda görülen sorunun koruması (genel; siteye / alana özgü sabit yok): bir
// radyonun bir değerinde sayfa iki tarihi KENDİSİ doldurup kilitliyor (kullanıcı değiştiremiyor), diğer değerinde tarihler girilebiliyor.
// Nöbetçi bu alanları o değerde "sayfada hazır" gösterip değiştirilebilir bırakıyordu; keşif düzenlenebilirlik değişimini kaydetmiyordu
// (kilit çoğu zaman nitelik değil: takvim bileşeni, betik ya da sınıf).
//  - Ortak algı (sayfa-envanteri.ts > alanKilidi): readonly / disabled / aria-readonly / aria-disabled / kapsayan fieldset / takvim + kilit
//    sınıfı / tuş + değer engeli / örtü — YALNIZ OKUMA (sayfaya yazmaz, olay göndermez).
//  - Keşif: her seçim değerinde düzenlenebilirliği değişen alanlar "kilitler" olarak kaydedilir; keşif tarihlere hiç dokunmaz.
//  - Veri durağı: kilitli alan AYNI YERDE, sayfadaki değeriyle kapalı girdi, kilit notu, Doldur yok; seçim değişince aynı yerde açılır;
//    grup notunda ve günlükte özet. 1440 / 390'da taşma yok.
//  - Kayıt: o dalda kilitli alan senaryoya / tabloya girmez, veri istenmez; diğer dalın önerisi veri ister; kilitli dalın önerisi değeri
//    senaryodan çıkarır. Normal koşu: o dalda alana hiç dokunulmaz; senaryoda değer olsa bile o an kilitliyse yazılmaz (adım notu, hata yok).
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (veri-duragi-fikstur.ts > /kilitli-secim/); geçici veritabanı; veri/ klasörüne dokunulmaz.
// Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { envanterOku, secimleriKesfet } from '../../scripts/platform/tarama/tarama-motoru';
import { alanKilidi } from '../../scripts/platform/tarama/sayfa-envanteri';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

test.describe('düzenlenebilirlik algısı ve keşif (127.0.0.1)', () => {
  test('alanKilidi: nitelik, kapsayan fieldset, aria, takvim kilit sınıfı, tuş + değer engeli ve örtü; yalnız tuş engeli ya da sayfa boyu perde kilit değildir; okurken hiçbir olay gitmez', async () => {
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      await page.setContent(`<input id="a" readonly><fieldset disabled><input id="b"></fieldset><div aria-disabled="true"><input id="c"></div>
        <input id="d" class="hasDatepicker ui-state-disabled"><input id="e" class="hasDatepicker"><input id="f" onkeydown="return false">
        <input id="g" onkeydown="return false" oninput="this.value = this.defaultValue; return false"><input id="h2" aria-readonly="true">
        <span style="position:relative;display:inline-block"><input id="h"><span style="position:absolute;inset:0;background:#eee"></span></span>
        <input id="j" value="x">
        <script>window.olay = 0; document.querySelectorAll('input').forEach(function (e) { ['keydown', 'input', 'change', 'focus', 'click'].forEach(function (t) { e.addEventListener(t, function () { window.olay++; }); }); });</script>`);
      const kilit = async (id: string): Promise<string | null> => page.locator(`#${id}`).evaluate(alanKilidi);
      expect(await kilit('a')).toBe('salt-okunur');
      expect(await kilit('h2')).toBe('salt-okunur');
      expect(await kilit('b')).toBe('devre-disi');
      expect(await kilit('c')).toBe('aria-devre-disi');
      expect(await kilit('d')).toBe('takvim-kilidi');
      expect(await kilit('e')).toBeNull();
      expect(await kilit('f')).toBeNull();
      expect(await kilit('g')).toBe('tus-deger');
      expect(await kilit('h')).toBe('ortu');
      expect(await kilit('j')).toBeNull();
      expect(await page.evaluate(() => (window as unknown as { olay: number }).olay)).toBe(0);
      await expect(page.locator('#j')).toHaveValue('x');
      // Sayfa boyu yüklenme perdesi alana özgü örtü değildir.
      await page.setContent('<input id="k"><div style="position:fixed;inset:0;background:rgba(0,0,0,.2)"></div>');
      expect(await kilit('k')).toBeNull();
    } finally { await t.close(); }
  });

  test('keşif her değerde düzenlenebilirliği değişen alanları kaydeder (Kısa: kilitli, Uzun: açık); tarihlere hiç dokunmaz, sayfaya yazmaz', async () => {
    const u = new VeriDuragiUygulamasi();
    const s = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      const git = async (): Promise<void> => { await page.goto(`${s.adres}/kilitli-secim/`); };
      await git();
      const temel = await envanterOku(page);
      const alan = (etiket: string): Nesne => {
        const a = temel.alanlar.find((x) => x.etiket === etiket);
        if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify(temel.alanlar.map((x) => x.etiket))}`);
        return a;
      };
      // Açılışta (Kısa) biri readonly niteliğiyle, diğeri yalnız takvim kapatma sınıfıyla kilitli (nitelik yok); "Ad" düzenlenebilir.
      expect(alan('Başlangıç tarihi')).toMatchObject({ kilit: 'salt-okunur', saltOkunur: true });
      expect(alan('Bitiş tarihi')).toMatchObject({ kilit: 'takvim-kilidi', saltOkunur: false, devreDisi: false });
      expect(alan('Ad').kilit).toBeUndefined();
      const kesifler = await secimleriKesfet(page, temel, [], git, async (p, ms) => { await p.waitForTimeout(Math.min(ms, 200)); }, 8);
      const sure = kesifler.find((k) => k.secim === alan('Süre tipi').anahtar);
      expect(sure?.ilkDeger).toBe('K');
      const uzun = sure?.degerler.find((d) => d.deger === 'U');
      expect(uzun?.kilitler, JSON.stringify(kesifler)).toEqual({ [alan('Başlangıç tarihi').anahtar]: false, [alan('Bitiş tarihi').anahtar]: false });
      expect(uzun?.gorunenler).toEqual([]);
      expect(uzun?.kaybolanlar).toEqual([]);
      // İlk değere dönüldü: tarihler yine kilitli, sayfanın değerleriyle; tarihlere hiçbir tuş / girdi olayı gitmedi; yazma isteği yok.
      await expect(page.locator('input[name=sure][value=K]')).toBeChecked();
      await expect(page.locator('#baslangic')).toHaveValue('05.10.2026');
      await expect(page.locator('#bitis')).toHaveValue('05.11.2026');
      expect(await page.evaluate(() => (window as unknown as { dokunma: number }).dokunma)).toBe(0);
      expect(u.istekler.filter((x) => x.startsWith('POST'))).toEqual([]);
    } finally { await t.close(); await s.kapat(); }
  });
});

test.describe('hızlı test, kayıt ve normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Kilit-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  const u = new VeriDuragiUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      if (o.durum === 'kesifOnay' && !durumlar.includes('kesifOnay')) { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };
  /** Senaryoyu koşar; sonuç ve bu koşuda fikstüre giden kayıtlar. */
  async function kos(senaryoId: string): Promise<{ sonuc: Nesne; kayitlar: Array<Record<string, string | number>> }> {
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const once = u.kilitliKayitlar.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    return { sonuc, kayitlar: u.kilitliKayitlar.slice(once) };
  }
  /** Bitiş koşulu "Kayıt alındı" ile kaydet durağına kadar (Evet izninde Kaydet kendiliğinden basılmadıysa basılır; once: veriden önceki kayıt sayısı). */
  async function bitir(id: string, once: number): Promise<void> {
    let o = await bekle(id, ['karar'], 180);
    if (u.kilitliKayitlar.length === once) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      expect(aday, JSON.stringify(o.soru.adaylar)).toBeTruthy();
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    expect(bitti, JSON.stringify(o.soru.etiketler)).toBeTruthy();
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'secime-gore-duzenlenemez-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Kilit Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Kısa: tarihler aynı yerde kilitli (sayfanın değeriyle, Doldur yok), Uzun seçilince aynı yerde açılır; özet; kayıtta tarih yok, Uzun önerisi veri ister; normal koşu tarihlere dokunmaz', async () => {
    test.setTimeout(600_000);
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/kilitli-secim/', ekranAdi: 'Başvuru Kısa', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    let onceKisa = 0;
    const sure = alanBul(o, 'Süre tipi');
    expect(sure).toMatchObject({ tur: 'radio', kontrol: true, sayfadaki: 'K' });
    for (const ad of ['Başlangıç tarihi', 'Bitiş tarihi']) {
      expect(alanBul(o, ad), ad).toMatchObject({ kilitKosulu: { secim: sure.anahtar, kilitli: { K: true, U: false } }, duzenlenemez: true, kosul: null });
    }
    expect(alanBul(o, 'Ad')).toMatchObject({ kilitKosulu: null, duzenlenemez: false });
    // Salt okunur bölümüne taşınmaz.
    expect((o.soru.saltOkunurlar ?? []) as Nesne[]).toEqual([]);

    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    try {
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      const sureKutusu = soru.locator(`.hizli-onsecim .hizli-onsecim-alani[data-anahtar="${sure.anahtar}"]`);
      await expect(sureKutusu.getByRole('radio', { name: 'Kısa' })).toBeChecked();
      const grup = sureKutusu.locator('.hizli-kosul-grubu');
      const satir = (ad: string) => grup.locator('.hizli-alan', { has: page.getByLabel(ad, { exact: true }) });
      const kilitliGorunur = async (): Promise<void> => {
        for (const [ad, deger] of [['Başlangıç tarihi', '05.10.2026'], ['Bitiş tarihi', '05.11.2026']]) {
          await expect(grup.getByLabel(ad, { exact: true }), ad).toBeDisabled();
          await expect(grup.getByLabel(ad, { exact: true }), ad).toHaveValue(deger);
          await expect(satir(ad).locator('.hizli-kilit-notu')).toHaveText('Bu seçimde sayfa dolduruyor, değiştirilemez.');
          await expect(satir(ad).locator('.hizli-kilit-notu .ikon')).toHaveCount(1);
          await expect(satir(ad).getByRole('button', { name: 'Doldur' })).toHaveCount(0);
          await expect(satir(ad).locator('.hizli-hazir-rozet')).toBeHidden();
        }
        await expect(grup.locator('.hizli-kosul-grubu-notu')).toHaveText('Kısa: Başlangıç tarihi, Bitiş tarihi sayfa tarafından dolduruluyor (değiştirilemez).');
      };
      await expect(grup.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Süre tipi: Kısa” seçimine göre:');
      await kilitliGorunur();
      // Ana listede ya da salt okunur bölümünde değil (aynı yer: seçimin grubu).
      await expect(soru.locator('.hizli-salt-okunur')).toHaveCount(0);
      await expect(soru.getByLabel('Başlangıç tarihi', { exact: true })).toHaveCount(1);
      await expect(soru.getByLabel('Ad', { exact: true })).toBeEnabled();
      await tasmaYok(page);
      await page.screenshot({ path: test.info().outputPath('secime-gore-duzenlenemez-1440.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(satir('Bitiş tarihi').locator('.hizli-kilit-notu')).toBeVisible();
      await tasmaYok(page);
      await page.screenshot({ path: test.info().outputPath('secime-gore-duzenlenemez-390.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Uzun: AYNI YERDE (aynı grup, aynı satır) anında düzenlenebilir; kilit notu gider, Doldur gelir. Seçim sayfaya uygulanınca özet.
      const satirOgesi = await satir('Başlangıç tarihi').elementHandle();
      await sureKutusu.getByRole('radio', { name: 'Uzun' }).check();
      for (const ad of ['Başlangıç tarihi', 'Bitiş tarihi']) {
        await expect(grup.getByLabel(ad, { exact: true }), ad).toBeEnabled();
        await expect(satir(ad).locator('.hizli-kilit-notu')).toBeHidden();
        await expect(satir(ad).getByRole('button', { name: 'Doldur' })).toHaveCount(1);
      }
      expect(await satir('Başlangıç tarihi').evaluate((e, x) => e === x, satirOgesi)).toBe(true);
      await expect(grup.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Süre tipi: Uzun” seçimine göre:');
      await expect(sureKutusu).toContainText('Sayfada “Uzun” seçili', { timeout: 60_000 });
      await expect(soru.locator('.not-kutusu')).toHaveText('“Süre tipi” = “Uzun” sayfaya uygulandı: Başlangıç tarihi, Bitiş tarihi düzenlenebilir.');
      await expect(grup.getByLabel('Bitiş tarihi', { exact: true })).toBeEnabled();
      await tasmaYok(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(grup.getByLabel('Bitiş tarihi', { exact: true })).toBeEnabled();
      await tasmaYok(page);
      await page.setViewportSize({ width: 1440, height: 900 });

      // Kısa'ya dönülür: aynı yerde yeniden kilitli; sayfaya uygulanınca özet ve günlük.
      await sureKutusu.getByRole('radio', { name: 'Kısa' }).check();
      await kilitliGorunur();
      await expect(sureKutusu).toContainText('Sayfada “Kısa” seçili', { timeout: 60_000 });
      const ozet = '“Süre tipi” = “Kısa” sayfaya uygulandı: Başlangıç tarihi, Bitiş tarihi sayfa tarafından dolduruluyor, değiştirilemez.';
      await expect(soru.locator('.not-kutusu')).toHaveText(ozet);
      await kilitliGorunur();
      o = await bekle(id, ['veri']);
      expect(JSON.stringify(o.gunluk)).toContain(ozet);
      await soru.getByLabel('Ad', { exact: true }).fill('Deneme Kişi');
      expect(u.kilitliKayitlar).toEqual([]);
      onceKisa = u.kilitliKayitlar.length;
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }

    await bitir(id, onceKisa);
    // Hızlı testte Kısa'da tarihlere hiç dokunulmadı: sayfanın değerleri gitti.
    const kisa = { sure: 'K', ad: 'Deneme Kişi', baslangic: '05.10.2026', bitis: '05.11.2026', dokunma: 0 };
    expect(u.kilitliKayitlar.at(-1)).toEqual(kisa);
    const baslik = 'Başvuru — Kısa';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    // Tablo / bağ: tarihler (bu dalda sayfanın doldurduğu) tabloya değer olarak girmez.
    const metin = JSON.stringify(oz.onizleme);
    expect(metin).not.toContain('05.10.2026');
    expect(metin).not.toContain('05.11.2026');
    // Öneri: Uzun dalı tarihleri ister (değer üretilmez); başlıkta kilit yok.
    const uzun = (oz.senaryolar as Nesne[]).find((x) => String(x.baslik).includes('Süre tipi: Uzun'));
    expect(uzun, JSON.stringify(oz.senaryolar)).toBeTruthy();
    expect(uzun?.veriGerekli).toEqual(['Başlangıç tarihi', 'Bitiş tarihi']);
    expect(uzun?.alt?.kaldirilanlar).toBeUndefined();
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [] });
    // Senaryoda tarih yok; model alanları var (Uzun'da doldurulsun diye), koşu o an kilitliyse yazmaz.
    const senaryo = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)).senaryo as Nesne;
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    const alanlar = (model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const m = (secici: string): Nesne => alanlar.find((a) => a.konum?.secici === secici) as Nesne;
    for (const s of ['#baslangic', '#bitis']) {
      expect(m(s), s).toMatchObject({ yapilandirma: 'senaryo', doldurucuParametreleri: expect.objectContaining({ kilit: true }) });
      expect(Object.keys(senaryo.veri as Nesne), s).not.toContain(String(m(s).eslesme.senaryo));
    }
    // Normal koşu: Kısa dalında tarihlere hiç dokunulmaz.
    const r = await kos(String(k.senaryoId));
    expect(r.sonuc.durum, JSON.stringify(r.sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(r.kayitlar).toEqual([kisa]);
  });

  test('Uzun: tarihler normal alan olarak yazılır; Kısa önerisi tarihleri senaryodan çıkarır; senaryoda değer olsa bile o an kilitliyse koşu yazmaz (not, hata yok)', async () => {
    test.setTimeout(600_000);
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/kilitli-secim/', ekranAdi: 'Başvuru Uzun', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    const o = await bekle(id, ['veri'], 300);
    const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
    const sure = alanBul(o, 'Süre tipi');
    const bas = alanBul(o, 'Başlangıç tarihi');
    const bit = alanBul(o, 'Bitiş tarihi');
    // Kısa'dayken tarihe değer gönderilse bile yazılmaz (sunucu kilitli alanı göndermez); Uzun seçilince yazılır.
    const onceUzun = u.kilitliKayitlar.length;
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Ad').anahtar]: deger('Deneme Uzun'), [sure.anahtar]: deger('U'), [bas.anahtar]: deger('10.10.2026'), [bit.anahtar]: deger('10.12.2026') } });
    await bitir(id, onceUzun);
    expect(u.kilitliKayitlar.at(-1)).toMatchObject({ sure: 'U', ad: 'Deneme Uzun', baslangic: '10.10.2026', bitis: '10.12.2026' });
    const baslik = 'Başvuru — Uzun';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    // Kısa önerisi: tarihleri o dalda sayfa dolduruyor — veri istenmez, senaryodaki değerleri çıkarılır; başlık bunu söyler.
    const kisaOneri = (oz.senaryolar as Nesne[]).find((x) => String(x.baslik).includes('Süre tipi: Kısa'));
    expect(kisaOneri, JSON.stringify(oz.senaryolar)).toBeTruthy();
    expect(kisaOneri?.baslik).toContain('Süre tipi: Kısa (Başlangıç tarihi, Bitiş tarihi sayfa dolduruyor)');
    expect(kisaOneri?.veriGerekli).toEqual([]);
    expect(kisaOneri?.alt?.kaldirilanlar).toEqual([bas.anahtar, bit.anahtar]);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [kisaOneri?.indeks] });
    const ek = (k.ekSenaryolar as Nesne[]).find((x) => x.baslik === kisaOneri?.baslik);
    expect(ek, JSON.stringify(k.ekSenaryolar)).toBeTruthy();
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    const alanlar = (model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const anahtar = (secici: string): string => String((alanlar.find((a) => a.konum?.secici === secici) as Nesne).eslesme.senaryo);
    const senaryoAl = async (sid: string): Promise<Nesne> => (await api(`/platform/senaryo?id=${sid}&ortamId=${ortamId}`)).senaryo as Nesne;
    const uzunSenaryo = await senaryoAl(String(k.senaryoId));
    expect(Object.keys(uzunSenaryo.veri as Nesne)).toEqual(expect.arrayContaining([anahtar('#baslangic'), anahtar('#bitis')]));
    const kisaSenaryo = await senaryoAl(String(ek?.id));
    expect(Object.keys(kisaSenaryo.veri as Nesne)).not.toContain(anahtar('#baslangic'));
    expect(Object.keys(kisaSenaryo.veri as Nesne)).not.toContain(anahtar('#bitis'));

    // Normal koşu Uzun: tarihler yazılır.
    let r = await kos(String(k.senaryoId));
    expect(r.sonuc.durum, JSON.stringify(r.sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(r.kayitlar).toEqual([expect.objectContaining({ sure: 'U', ad: 'Deneme Uzun', baslangic: '10.10.2026', bitis: '10.12.2026' })]);
    // Kısa önerisi: tarihlere dokunulmaz.
    r = await kos(String(ek?.id));
    expect(r.sonuc.durum, JSON.stringify(r.sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(r.kayitlar).toEqual([{ sure: 'K', ad: 'Deneme Uzun', baslangic: '05.10.2026', bitis: '05.11.2026', dokunma: 0 }]);

    // Senaryoda tarih DEĞERİ olsa bile (eski senaryo) Kısa'da alan o an kilitli: yazılmaz, adım notu düşer, koşu başarılı.
    const sureAlani = alanlar.find((a) => a.konum?.secici === 'input[type="radio"][name="sure"]') as Nesne;
    const kisaSecenek = (sureAlani.secenekler as Nesne[]).find((x) => x.metin === 'Kısa') as Nesne;
    const veri = { ...(uzunSenaryo.veri as Nesne), [String(sureAlani.eslesme.senaryo)]: String(kisaSecenek.senaryoDegeri ?? kisaSecenek.metin), [anahtar('#baslangic')]: '10.10.2026', [anahtar('#bitis')]: '10.12.2026' };
    const eski = await basarili('/platform/senaryo/kaydet', { projeId, ekranId: String(k.ekranId), baslik: 'Başvuru — eski Kısa', ortamIdleri: [ortamId], veri, tabloSecimleri: uzunSenaryo.tabloSecimleri ?? undefined });
    r = await kos(String(eski.id));
    expect(r.sonuc.durum, JSON.stringify(r.sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(r.kayitlar).toEqual([{ sure: 'K', ad: 'Deneme Uzun', baslangic: '05.10.2026', bitis: '05.11.2026', dokunma: 0 }]);
    const adimlar = JSON.stringify(r.sonuc.adimlar);
    expect(adimlar).toContain('“Başlangıç tarihi”: alan sayfa tarafından dolduruluyor, yazılmadı');
    expect(adimlar).toContain('“Bitiş tarihi”: alan sayfa tarafından dolduruluyor, yazılmadı');
  });
});
