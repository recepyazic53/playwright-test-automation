// SEÇİME GÖRE DEĞİŞEN ETİKET (hızlı test). Gerçek ekranda görülen sorunun koruması (genel; siteye özgü sabit yok): "Kişi tipi" Tüzel
// seçilince yeni alan belirmez; doğum tarihi gizlenir ve AYNI kutuların adı değişir (Kimlik no → Vergi no, Cep telefonu → İş telefonu).
// Nöbetçi bunu yalnız "belirdi / kayboldu" diye görüyordu: Tüzel grubu boştu, günlükte "başka alan görünmüyor" yazıyordu, ortak alanlar
// Özel adıyla kalıyordu ve kayıt tablosunda Tüzel senaryosunun vergi nosu "Kimlik no" sütununa yazılıyordu.
//  - Keşif: her değerde etiketi DEĞİŞEN alanlar da kaydedilir (anahtar aynı → etiketler); etiket değiştiren seçim "Önce bunu seçin"de çıkar.
//  - Veri durağı: her değerin grubunda açılan / gizlenen / adı değişen alanlar; adı değişen alan yeni adıyla ve "(Özel'de: Kimlik no)";
//    hiçbir şey değişmiyorsa açık metin; getirden sonra adlar sayfadan tazelenir. 1440 ve 390 px'te taşma yok.
//  - Günlük: değişiklik özeti. Kayıt: sütun adı senaryonun dalındaki ad; öneri başlığı dalın adlarını söyler; normal koşu Tüzel dalını
//    vergi no ile yürütür.
//  - Aynı kutunun en çok karakteri de seçime göre değişir (11 → 10): keşif "kurallar", veri durağında "En çok 10 karakter." ve aşım uyarısı.
//  - Gerçek yapı: etiketler "for" ile değil satırdaki span'da; gizli <select> + seçili metni gösteren kutu (özel açılır liste, normal koşuda
//    ozelSecim); gizli girdili süslü radyo; tuşla yazmayı engelleyen takvimli tarih (takvimden: değer + olaylar; hızlı test, kayıt ve normal
//    koşuda doğru tarih); salt okunur hesaplanan alanlar sorulmaz, veri durağında ve bitişte değerleriyle bilgi olarak.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (veri-duragi-fikstur.ts > /etiketli/); geçici veritabanı; veri/ klasörüne dokunulmaz.
// Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { envanterOku, secimleriKesfet } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

/** Ekran görüntülerinin kopyalanacağı klasör (isteğe bağlı; GORUNTU_KLASORU). */
function goruntuKopyala(kaynak: string, ad: string): void {
  if (!process.env.GORUNTU_KLASORU) return;
  mkdirSync(process.env.GORUNTU_KLASORU, { recursive: true });
  copyFileSync(kaynak, join(process.env.GORUNTU_KLASORU, ad));
}

test.describe('keşif (127.0.0.1)', () => {
  test('her değerde etiketi değişen alanlar kaydedilir (anahtar aynı); gizlenen alan kaybolanlarda; başka seçimde gerçekten yeni alan belirir', async () => {
    const u = new VeriDuragiUygulamasi();
    const s = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const t = await korumaliTarayici();
    try {
      const page = await (await t.newContext()).newPage();
      const git = async (): Promise<void> => { await page.goto(`${s.adres}/etiketli/`); };
      await git();
      const temel = await envanterOku(page);
      const anahtar = (etiket: string): string => {
        const a = temel.alanlar.find((x) => x.etiket === etiket);
        if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify(temel.alanlar.map((x) => x.etiket))}`);
        return a.anahtar;
      };
      const kesifler = await secimleriKesfet(page, temel, [], git, async (p, ms) => { await p.waitForTimeout(Math.min(ms, 200)); }, 8);
      const tip = kesifler.find((k) => k.secim === anahtar('Kişi tipi'));
      const tuzel = tip?.degerler.find((d) => d.deger === 'T');
      expect(tuzel, JSON.stringify(kesifler)).toBeTruthy();
      expect(tuzel?.gorunenler).toEqual([]);
      expect(tuzel?.kaybolanlar).toEqual([anahtar('Doğum tarihi')]);
      expect(tuzel?.etiketler).toEqual({ [anahtar('Kimlik no')]: 'Vergi no', [anahtar('Cep telefonu')]: 'İş telefonu' });
      // Aynı kutunun en çok karakteri de seçime göre değişir (11 → 10).
      expect(temel.alanlar.find((a) => a.etiket === 'Kimlik no')?.enCok).toBe(11);
      expect(tuzel?.kurallar).toEqual({ [anahtar('Kimlik no')]: { enCok: 10, desen: null } });
      // Etiket satırdaki span'dan (for yok); süslü gizli radyo grubu; gizli <select> + seçili metni gösteren kutu → özel açılır liste.
      const tipAlani = temel.alanlar.find((a) => a.anahtar === anahtar('Kişi tipi'));
      expect(tipAlani?.radyolar?.map((r) => r.metin)).toEqual(['Özel', 'Tüzel']);
      expect(temel.alanlar.find((a) => a.etiket === 'Seçenek no')).toMatchObject({ tur: 'select', ozelBilesen: true, kimlik: 'secenekNo' });
      // Tuşla yazmayı engelleyen takvimli tarih alanı (salt okunur değil) takvimden; hesaplanan alanlar salt okunur.
      expect(temel.alanlar.find((a) => a.etiket === 'Doğum tarihi')).toMatchObject({ takvimden: true, saltOkunur: false });
      expect(temel.alanlar.filter((a) => a.saltOkunur).map((a) => a.etiket)).toEqual(['Hesaplanan tutar', 'Ek tutar']);
      const farkli = kesifler.find((k) => k.secim === anahtar('Adres farklı'));
      const evet = farkli?.degerler.find((d) => d.deger === 'E');
      expect(evet?.gorunenler.map((a) => a.etiket)).toEqual(['Adres']);
      expect(evet?.etiketler).toBeUndefined();
      // İlk değerler geri yüklendi: adlar yine Özel'in adları.
      await expect(page.locator('#kimlikAdi')).toHaveText('Kimlik no');
      expect(u.istekler.filter((x) => x.startsWith('POST'))).toEqual([]);
    } finally { await t.close(); await s.kapat(); }
  });
});

test.describe('hızlı test, kayıt ve normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Etiket-${randomBytes(6).toString('hex')}`;
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

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'secime-gore-etiket-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Etiket Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('Tüzel grubunda gizlenen ve adı değişen alanlar; getir sonrası adlar tazelenir; günlükte özet; tablo sütunu ve öneri başlığı dalın adıyla; normal koşu Tüzel dalını vergi no ile yürütür', async () => {
    test.setTimeout(600_000);
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/etiketli/', ekranAdi: 'Başvuru', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    expect(u.etiketliKayitlar).toEqual([]);
    // Keşif: etiket değiştiren seçim "kontrol"; adı değişen alanlar seçime bağlı; gizlenen / yeni alan koşullu.
    const tip = alanBul(o, 'Kişi tipi');
    expect(tip).toMatchObject({ tur: 'radio', kontrol: true, sayfadaki: 'O' });
    expect(alanBul(o, 'Kimlik no').etiketKosulu).toMatchObject({ secim: tip.anahtar, etiketler: { O: 'Kimlik no', T: 'Vergi no' } });
    expect(alanBul(o, 'Cep telefonu').etiketKosulu).toMatchObject({ secim: tip.anahtar, etiketler: { O: 'Cep telefonu', T: 'İş telefonu' } });
    expect(alanBul(o, 'Doğum tarihi').kosul).toMatchObject({ secim: tip.anahtar, degerler: ['O'] });
    expect(alanBul(o, 'Ad').etiketKosulu).toBeNull();
    const farkli = alanBul(o, 'Adres farklı');
    expect(farkli).toMatchObject({ kontrol: true });
    expect(alanBul(o, 'Adres').kosul).toMatchObject({ secim: farkli.anahtar, degerler: ['E'] });

    const tarayici = await korumaliTarayici();
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    try {
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
      const onsecim = soru.locator('.hizli-onsecim');
      const tipKutusu = onsecim.locator(`.hizli-onsecim-alani[data-anahtar="${tip.anahtar}"]`);
      const farkliKutusu = onsecim.locator(`.hizli-onsecim-alani[data-anahtar="${farkli.anahtar}"]`);
      await expect(tipKutusu.getByRole('radio', { name: 'Özel' })).toBeChecked();
      // Özel grubu: açılan alan (Doğum tarihi) + adı seçime göre değişen alanlar (Tüzel'deki adlarıyla).
      const tipGrubu = tipKutusu.locator('.hizli-kosul-grubu');
      await expect(tipGrubu.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Kişi tipi: Özel” seçimine göre:');
      await expect(tipGrubu.getByLabel('Doğum tarihi', { exact: true })).toBeVisible();
      await expect(tipGrubu.getByLabel('Kimlik no', { exact: true })).toBeVisible();
      await expect(tipGrubu.locator('.hizli-alan', { has: page.getByLabel('Kimlik no', { exact: true }) }).locator('.hizli-etiket-diger')).toHaveText('(Tüzel\'de: Vergi no, en çok 10 karakter)');
      await expect(tipGrubu.getByLabel('Cep telefonu', { exact: true })).toBeVisible();
      // Ortak, adı değişmeyen alan ana listede.
      await expect(soru.getByLabel('Ad', { exact: true })).toBeVisible();
      await expect(onsecim.getByLabel('Ad', { exact: true })).toHaveCount(0);
      // Adres farklı = Hayır: grup boş değil, gizlenen alanı söyler.
      await expect(farkliKutusu.locator('.hizli-kosul-grubu-notu')).toHaveText('Bu seçimde “Adres” sorulmaz.');
      // Sayfanın doldurduğu salt okunur alanlar sorulmaz; bilgi olarak, sayfadaki değerleriyle (keşif listeyi denedi: sayfa hesapladı).
      const saltOkunur = soru.locator('.hizli-salt-okunur');
      await expect(saltOkunur.getByRole('heading', { name: 'Sayfanın doldurduğu alanlar (salt okunur)' })).toBeVisible();
      await expect(saltOkunur.locator('li')).toHaveText([/^Hesaplanan tutar: (\d+|şu an boş)$/, /^Ek tutar: (\d+|şu an boş)$/]);
      await expect(soru.getByLabel('Hesaplanan tutar', { exact: true })).toHaveCount(0);
      await tasmaYok(page);

      // Tüzel: anında Tüzel grubu — Doğum tarihi sorulmaz, adı değişen alanlar yeni adlarıyla (Özel'deki adları yanında).
      await tipKutusu.getByRole('radio', { name: 'Tüzel' }).check();
      await expect(tipGrubu.locator('.hizli-kosul-grubu-baslik')).toHaveText('“Kişi tipi: Tüzel” seçimine göre:');
      await expect(tipGrubu.locator('.hizli-kosul-grubu-notu')).toHaveText('Bu seçimde “Doğum tarihi” sorulmaz.');
      await expect(soru.getByLabel('Doğum tarihi', { exact: true })).toHaveCount(0);
      await expect(tipGrubu.getByLabel('Vergi no', { exact: true })).toBeVisible();
      await expect(tipGrubu.getByLabel('İş telefonu', { exact: true })).toBeVisible();
      await expect(soru.getByLabel('Kimlik no', { exact: true })).toHaveCount(0);
      await expect(tipGrubu.locator('.hizli-alan', { has: page.getByLabel('Vergi no', { exact: true }) }).locator('.hizli-etiket-diger')).toHaveText('(Özel\'de: Kimlik no, en çok 11 karakter)');
      // En çok karakter seçime göre: Tüzel'de 10; aşılırsa uyarı (engellemez).
      const vergiSatiri = tipGrubu.locator('.hizli-alan', { has: page.getByLabel('Vergi no', { exact: true }) });
      await expect(vergiSatiri.locator('.hizli-uzunluk')).toHaveText('En çok 10 karakter.');
      await vergiSatiri.getByLabel('Vergi no', { exact: true }).fill('12345678901');
      await expect(vergiSatiri.locator('.hizli-uzunluk')).toHaveText('11 karakter girildi; bu alan en çok 10 karakter alır.');
      await vergiSatiri.getByLabel('Vergi no', { exact: true }).fill('');
      await expect(tipGrubu.locator('.hizli-alan', { has: page.getByLabel('İş telefonu', { exact: true }) }).locator('.hizli-etiket-diger')).toHaveText('(Özel\'de: Cep telefonu)');
      // Adres farklı = Evet: gerçekten yeni alan açılır.
      await farkliKutusu.getByRole('radio', { name: 'Evet' }).check();
      await expect(farkliKutusu.getByLabel('Adres', { exact: true })).toBeVisible();
      await expect(farkliKutusu.locator('.hizli-kosul-grubu-notu')).toBeHidden();
      await farkliKutusu.getByRole('radio', { name: 'Hayır' }).check();
      await expect(soru.getByLabel('Adres', { exact: true })).toHaveCount(0);
      await tasmaYok(page);
      const goruntu = test.info().outputPath('secime-gore-etiket-1440.png');
      await page.screenshot({ path: goruntu, fullPage: true });
      goruntuKopyala(goruntu, 'secime-gore-etiket-1440.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(tipGrubu.getByLabel('Vergi no', { exact: true })).toBeVisible();
      await tasmaYok(page);
      const goruntu390 = test.info().outputPath('secime-gore-etiket-390.png');
      await page.screenshot({ path: goruntu390, fullPage: true });
      goruntuKopyala(goruntu390, 'secime-gore-etiket-390.png');
      await page.setViewportSize({ width: 1440, height: 900 });

      // "↓ Bu seçime göre alanları getir": seçim sayfaya uygulanır; adlar sayfadan tazelenir; not ve günlükte değişiklik özeti.
      await tipKutusu.getByRole('button', { name: 'Bu seçime göre alanları getir', exact: true }).click();
      await expect(tipKutusu).toContainText('Sayfada “Tüzel” seçili', { timeout: 60_000 });
      const ozet = '“Kişi tipi” = “Tüzel” sayfaya uygulandı: Doğum tarihi gizlendi; Kimlik no → Vergi no (en çok 10 karakter); Cep telefonu → İş telefonu.';
      await expect(soru.locator('.not-kutusu')).toHaveText(ozet);
      await expect(soru.getByLabel('Vergi no', { exact: true })).toBeFocused();
      await expect(soru.getByLabel('Kimlik no', { exact: true })).toHaveCount(0);
      o = await bekle(id, ['veri']);
      expect(JSON.stringify(o.gunluk)).toContain(ozet);
      expect(JSON.stringify(o.gunluk)).not.toContain('başka alan görünmüyor');
      expect(alanBul(o, 'Vergi no').etiketKosulu).toMatchObject({ etiketler: { O: 'Kimlik no', T: 'Vergi no' } });
      await soru.getByLabel('Ad', { exact: true }).fill('Deneme Ticaret');
      await soru.getByLabel('Vergi no', { exact: true }).fill('1234567890');
      await soru.getByLabel('İş telefonu', { exact: true }).fill('2125550000');
      expect(u.etiketliKayitlar).toEqual([]);
      await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 120_000 });
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }

    o = await bekle(id, ['karar']);
    if (!u.etiketliKayitlar.length) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      expect(aday, JSON.stringify(o.soru.adaylar)).toBeTruthy();
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    // (Hesaplanan tutar keşifte sayfanın hesapladığı değerle gidebilir; burada ilgilenilmez.)
    expect(u.etiketliKayitlar.at(-1)).toMatchObject({ tip: 'T', ad: 'Deneme Ticaret', kimlik: '1234567890', telefon: '2125550000', secenekNo: '1' });
    expect(u.etiketliKayitlar.at(-1)?.dogum).toBeUndefined();
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    expect(bitti, JSON.stringify(o.soru.etiketler)).toBeTruthy();
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    const baslik = 'Başvuru — Tüzel';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    // Tablo: Tüzel senaryosunun kimlik kutusu "Vergi no" sütununa bağlanır; alanlar Tüzel adlarıyla (Özel adları sütun / bağ olmaz).
    const metin = JSON.stringify(oz.onizleme);
    const bag = (alanId: string): Nesne | undefined => (oz.onizleme.baglantilar as Nesne[]).find((b) => b.alanId === alanId);
    expect(bag('kimlik'), metin).toMatchObject({ alanEtiketi: 'Vergi no', sutun: 'Vergi no' });
    expect(bag('telefon'), metin).toMatchObject({ alanEtiketi: 'İş telefonu' });
    expect(metin).not.toContain('"Kimlik no"');
    expect(metin).not.toContain('"Cep telefonu"');
    // Öneri: Özel dalı başlığında o dalın adları; değeri olmayan alanlar "veri gerekli" (değer üretilmez).
    const ozel = (oz.senaryolar as Nesne[]).find((x) => String(x.baslik).includes('Kişi tipi: Özel'));
    expect(ozel?.baslik, JSON.stringify(oz.senaryolar)).toContain(`${baslik} — Kişi tipi: Özel (Kimlik no, Cep telefonu)`);
    // (Doğum tarihi sayfada varsayılan değerle hazır geldiği için veri gerekmez.)
    expect(ozel?.veriGerekli).toEqual(expect.arrayContaining(['Kimlik no', 'Cep telefonu']));
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [] });

    // Normal koşu: Tüzel dalı vergi no ile (doğum tarihi sorulmaz / gönderilmez).
    const once = u.etiketliKayitlar.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId: String(k.senaryoId), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(u.etiketliKayitlar.slice(once)).toEqual([{ tip: 'T', ad: 'Deneme Ticaret', kimlik: '1234567890', telefon: '2125550000', secenekNo: '1' }]);
  });
  test('Özel dalı: tuşla yazılamayan takvimli doğum tarihi ve süslü (gizli) liste hızlı test → kayıt → normal koşuda doğru değerle; salt okunur hesaplanan alanlar sorulmaz, bitişte değerleriyle', async () => {
    test.setTimeout(600_000);
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/etiketli/', ekranAdi: 'Başvuru Özel', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    // Salt okunur hesaplanan alanlar sorulmaz; bilgi olarak.
    expect((o.soru.saltOkunurlar as Nesne[]).map((x) => x.etiket)).toEqual(['Hesaplanan tutar', 'Ek tutar']);
    expect((o.soru.alanlar as Nesne[]).some((a) => a.etiket === 'Hesaplanan tutar' || a.etiket === 'Ek tutar')).toBe(false);
    const secenek = alanBul(o, 'Seçenek no');
    expect((secenek.secenekler as Nesne[]).map((x) => x.deger)).toEqual(expect.arrayContaining(['1', '2']));
    expect(alanBul(o, 'Kimlik no').enCok).toBe(11);
    const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
    const degerler = {
      [alanBul(o, 'Ad').anahtar]: deger('Deneme Kişi'), [alanBul(o, 'Doğum tarihi').anahtar]: deger('13.04.1998'),
      [alanBul(o, 'Kimlik no').anahtar]: deger('12345678901'), [alanBul(o, 'Cep telefonu').anahtar]: deger('5321234567'), [secenek.anahtar]: deger('2')
    };
    await basarili('/platform/hizli-test/veri', { id, degerler });
    o = await bekle(id, ['karar'], 180);
    if (!u.etiketliKayitlar.some((x) => x.tip === 'O')) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      expect(aday, JSON.stringify(o.soru.adaylar)).toBeTruthy();
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    const beklenen = { tip: 'O', ad: 'Deneme Kişi', dogum: '13.04.1998', kimlik: '12345678901', telefon: '5321234567', secenekNo: '2', hesap: '200' };
    expect(u.etiketliKayitlar.at(-1)).toEqual(beklenen);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    // Bitişte salt okunur alanlar sayfanın hesapladığı değerleriyle.
    expect(o.soru.saltOkunurlar).toEqual([expect.objectContaining({ etiket: 'Hesaplanan tutar', deger: '200' }), expect.objectContaining({ etiket: 'Ek tutar', deger: '30' })]);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru — Özel', senaryoIndeksleri: [] });
    // Model: takvimli tarih "tarihJs" (takvim), süslü liste "ozelSecim".
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    const alanlar = (model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const m = (secici: string): Nesne => alanlar.find((a) => a.konum?.secici === secici) as Nesne;
    expect(m('#dogum'), JSON.stringify(m('#dogum'))).toMatchObject({ doldurucu: 'tarihJs', doldurucuParametreleri: { takvim: true } });
    expect(alanlar.map((a) => [a.konum?.secici, a.doldurucu, a.tip])).toContainEqual(['#secenekNo', 'ozelSecim', 'secim']);
    // Normal koşu: aynı değerler (doğum tarihi tuşla değil değer + olaylarla; liste süslü kutudan).
    const once = u.etiketliKayitlar.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId: String(k.senaryoId), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(u.etiketliKayitlar.slice(once)).toEqual([beklenen]);
  });
});
