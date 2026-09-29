// KORUMA TESTLERİ — KURTARMA KURALLARI, EKRAN TARAFI (tests/support/model-kosucu.ts): adım başarısız olunca senaryonun ekranını
// kapsayan kural koşulu (metin / öğe / giriş sayfası) sayfada aranır, eylem (yenile / tıkla / girişi yenile) yapılır, sonra adım tekrar
// denenir ya da devam edilir; not "kurtarma" ekiyle rapora gider. Çift kayıt koruması: işaretsiz (kosu.tekrarDenenebilir yok) adımda
// yenileme / tekrar yapılmaz. Kapsam: başka ekranın kuralı çalışmaz. Ayrıca: sonuç deposu (not + sayaç), akış tasarımında "Tekrar
// denenebilir" gidiş-dönüşü ve doğrulayıcı. Yalnız 127.0.0.1'deki sahte uygulama; nötr metinler; dışarıya istek yok.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { girisTarifiOlmali } from '../../scripts/platform/giris/tarif.mjs';
import type { EkranKurali } from '../../scripts/platform/ayarlar/kurtarma-kurallari.mjs';
import { kurtarmaSayaclari } from '../../scripts/platform/ayarlar/kurtarma-kurallari.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuDetayi, kosuKaydet, sonucDetayi, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { adimlardanBloklar, korunanParcalari, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla, type AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { kosuTanimiFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const SONUC = 'İşlem tamamlandı';
const GECICI = 'Geçici sorun, lütfen tekrar deneyin';
const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title></head><body>${govde}</body></html>`
});

/** Tek adımlı "İşlem" modeli: Gönder'e basılır, #sonuc'ta başarı metni beklenir (kısa süre). */
function model(ekranUrl: string, ek: { tekrarDenenebilir?: boolean; girisGerekmez?: boolean } = {}): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'islem', ad: 'İşlem', aciklama: 'Kurtarma kuralı (nötr fikstür).', ekranUrl, girisGerekmez: ek.girisGerekmez !== false,
    specDosyasi: 'tests/scenarios/islem/islem.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (islem)' }, kosullar: {},
    adimlar: [{
      id: 'gonder', sira: 1, baslik: 'Gönder',
      bolumler: [{ id: 'islemler', baslik: 'İşlemler', alanlar: [{ id: 'gonderDugmesi', tip: 'buton', etiket: { ekran: 'Gönder' }, yapilandirma: 'aksiyon', konum: { secici: '#gonder', kirilganlik: 'orta' } }] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: SONUC, secici: '#sonuc' }, zamanAsimiSn: 2,
        ...(ek.tekrarDenenebilir ? { tekrarDenenebilir: true } : {}) }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const kural = (id: string, g: Partial<EkranKurali> & Pick<EkranKurali, 'kosul' | 'eylem' | 'sonra'>): EkranKurali => ({
  id, ad: id, sira: 1, acik: true, tur: 'ekran', kapsam: { ogeler: null, ortamlar: null }, ...g
} as EkranKurali);

const TARIF = girisTarifiOlmali({
  surum: 1, girisAdresi: '/giris', oturumKontrolAdresi: '/ana', kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
  basariGostergesi: { tur: 'eleman', deger: '#cikis' }, hataGostergeleri: [], ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 10, baglamDegistirme: null
});

test.describe('kurtarma kuralları: ekran koşusu (127.0.0.1)', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  const sayac: Record<string, number> = {};
  const klasor = mkdtempSync(join(tmpdir(), 'kurtarma-ekran-'));
  const oncekiKontrol = process.env.NOBETCI_OTURUM_KONTROL_MS;

  /** İlk yüklemede Gönder "geçici sorun" gösterir; sonraki yüklemelerde başarı. */
  const geciciSayfa = (yol: string): FiksturYaniti => {
    const ilk = (sayac[yol] = (sayac[yol] ?? 0) + 1) === 1;
    return html('İşlem', `<button type="button" id="gonder">Gönder</button><p id="hata"></p><p id="sonuc"></p>
<script>document.getElementById('gonder').addEventListener('click', () => { ${ilk ? `document.getElementById('hata').textContent = '${GECICI}';` : `document.getElementById('sonuc').textContent = '${SONUC}';`} });</script>`);
  };
  const uygulama = (i: FiksturIstegi): FiksturYaniti => {
    if (['/metin', '/metin-isaretsiz', '/metin-kapsam'].includes(i.yol)) return geciciSayfa(i.yol);
    if (i.yol === '/oge') {
      return html('İşlem', `<button type="button" id="gonder">Gönder</button><p id="sonuc"></p>
<div id="kutu" role="dialog" aria-label="Duyuru" hidden>Duyuru <button type="button" id="kapat">Kapat</button></div>
<script>
document.getElementById('gonder').addEventListener('click', () => { document.getElementById('kutu').hidden = false; });
document.getElementById('kapat').addEventListener('click', () => { document.getElementById('kutu').hidden = true; document.getElementById('sonuc').textContent = '${SONUC}'; });
</script>`);
    }
    const girisli = i.cerezler.oturum === '1';
    const giriseGit: FiksturYaniti = { durum: 302, basliklar: { location: '/giris' }, govde: '' };
    if (i.yol === '/giris') {
      return html('Giriş', `<label>Kullanıcı <input id="kullanici"></label><label>Parola <input id="parola" type="password"></label><button type="button" id="gir">Giriş</button>
<script>document.getElementById('gir').addEventListener('click', () => { document.cookie = 'oturum=1; path=/'; location.href = '/ana'; });</script>`);
    }
    if (i.yol === '/ana') return girisli ? html('Ana', '<a id="cikis" href="#">Çıkış</a>') : giriseGit;
    if (i.yol === '/ekran') return girisli ? html('İşlem', '<a id="gonder" href="/islem">Gönder</a><p id="sonuc"></p>') : giriseGit;
    if (i.yol === '/islem') {
      if (!girisli) return giriseGit;
      // İlk işlemde oturum düşer (çerez silinir, giriş sayfasına yönlenir); sonrakinde işlem tamamlanır.
      if ((sayac.islem = (sayac.islem ?? 0) + 1) === 1) return { durum: 302, basliklar: { location: '/giris', 'set-cookie': 'oturum=; Path=/; Max-Age=0' }, govde: '' };
      return html('İşlem', `<p id="sonuc">${SONUC}</p>`);
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  test.beforeAll(async () => {
    process.env.NOBETCI_OTURUM_KONTROL_MS = '1000';
    sunucu = await yerelSunucu(uygulama);
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => {
    if (oncekiKontrol === undefined) delete process.env.NOBETCI_OTURUM_KONTROL_MS; else process.env.NOBETCI_OTURUM_KONTROL_MS = oncekiKontrol;
    await tarayici?.close();
    await sunucu?.kapat();
    rmSync(klasor, { recursive: true, force: true });
  });

  async function kos(testInfo: TestInfo, m: Nesne, kurallar: EkranKurali[], secenek: { giris?: boolean } = {}): Promise<{ page: Page; hata: string | null; kurtarma: Nesne[]; kapat: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {}, kurtarmaKurallari: kurallar },
      tarif: () => { if (!secenek.giris) throw new Error('giriş yok'); return TARIF; },
      kimlik: () => ({ kullaniciAdi: 'deneme', parola: 'Sahte-Parola-1', totpGizli: null, sabitKod: null, smsKipi: null }),
      oturumDosyasi: () => join(klasor, 'oturum.json')
    };
    const s: PlatformModelSenaryosu = { id: 's1', baslik: 'İşlem', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'islem', ad: 'İşlem' }, model: m, modelSurumu: 1, altModeller: {}, veri: {}, mutlakaGorunmeli: [] };
    const once = testInfo.annotations.length;
    let hata: string | null = null;
    try { await modelSenaryosunuKos(page, testInfo, s, ortam); } catch (e) { hata = (e as Error).message; }
    const not = testInfo.annotations.slice(once).find((x) => x.type === 'kurtarma');
    return { page, hata, kurtarma: not ? JSON.parse(String(not.description)) as Nesne[] : [], kapat: () => baglam.close() };
  }

  test('metin görünür → sayfayı yenile → adımı tekrar dene: 2. denemede başarılı, not düşer', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/metin', { tekrarDenenebilir: true }), [
      kural('geçici-metin', { ad: 'Geçici sorun', kosul: { tur: 'metin', metin: 'Geçici sorun' }, eylem: { tur: 'yenile' }, sonra: { tur: 'tekrar', kez: 1 } })
    ]);
    try {
      expect(r.hata).toBeNull();
      await expect(r.page.locator('#sonuc')).toHaveText(SONUC);
      expect(sayac['/metin']).toBe(2);
      expect(r.kurtarma).toEqual([{ kuralId: 'geçici-metin', kural: 'Geçici sorun', adim: 'Gönder', durum: 'kurtarildi', deneme: 2,
        not: 'kurtarıldı: metin "Geçici sorun" → sayfa yenilendi → 2. denemede başarılı' }]);
    } finally { await r.kapat(); }
  });

  test('çift kayıt koruması: işaretsiz adımda sayfa yenilenmez, adım tekrar denenmez; test kalır ve not düşer', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/metin-isaretsiz'), [
      kural('geçici-metin', { ad: 'Geçici sorun', kosul: { tur: 'metin', metin: 'Geçici sorun' }, eylem: { tur: 'yenile' }, sonra: { tur: 'tekrar', kez: 2 } })
    ]);
    try {
      expect(r.hata).toContain(SONUC);
      expect(sayac['/metin-isaretsiz']).toBe(1);
      expect(r.kurtarma).toEqual([{ kuralId: 'geçici-metin', kural: 'Geçici sorun', adim: 'Gönder', durum: 'tekrarlanmadi', deneme: 1,
        not: 'kayıt oluşturan adım tekrar denenmedi: metin "Geçici sorun" ("Gönder" tekrar denenebilir işaretli değil; kural: Geçici sorun)' }]);
    } finally { await r.kapat(); }
  });

  test('kapsam: başka ekranın kuralı çalışmaz', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/metin-kapsam', { tekrarDenenebilir: true }), [
      kural('baska-ekran', { kosul: { tur: 'metin', metin: 'Geçici sorun' }, eylem: { tur: 'yenile' }, sonra: { tur: 'tekrar', kez: 1 }, kapsam: { ogeler: ['baska-ekran-kimligi'], ortamlar: null } })
    ]);
    try {
      expect(r.hata).toContain(SONUC);
      expect(sayac['/metin-kapsam']).toBe(1);
      expect(r.kurtarma).toEqual([]);
    } finally { await r.kapat(); }
  });

  test('öğe görünür → öğeye tıkla → devam (işaretsiz adımda da; adım tekrarlanmaz, sonuç yeniden denetlenir)', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const r = await kos(testInfo, model('/oge'), [
      kural('duyuru', { ad: 'Duyuru penceresi', kosul: { tur: 'oge', secici: '#kutu' }, eylem: { tur: 'tikla', secici: '#kapat' }, sonra: { tur: 'devam' } })
    ]);
    try {
      expect(r.hata).toBeNull();
      await expect(r.page.locator('#kutu')).toBeHidden();
      await expect(r.page.locator('#sonuc')).toHaveText(SONUC);
      expect(r.kurtarma).toEqual([{ kuralId: 'duyuru', kural: 'Duyuru penceresi', adim: 'Gönder', durum: 'kurtarildi', deneme: 1,
        not: 'kurtarıldı: öğe #kutu → "#kapat" tıklandı → devam edildi' }]);
    } finally { await r.kapat(); }
  });

  test('giriş sayfasına düştü (oturum bitti) → girişi yenile → adımı tekrar dene', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const m = model('/ekran', { tekrarDenenebilir: true, girisGerekmez: false });
    delete m.girisGerekmez;
    const r = await kos(testInfo, m, [
      kural('oturum', { ad: 'Oturum bitti', kosul: { tur: 'girisSayfasi' }, eylem: { tur: 'girisYenile' }, sonra: { tur: 'tekrar', kez: 1 } })
    ], { giris: true });
    try {
      expect(r.hata).toBeNull();
      await expect(r.page.locator('#sonuc')).toHaveText(SONUC);
      expect(sayac.islem).toBe(2);
      expect(r.kurtarma).toEqual([{ kuralId: 'oturum', kural: 'Oturum bitti', adim: 'Gönder', durum: 'kurtarildi', deneme: 2,
        not: 'kurtarıldı: giriş sayfasına düştü → giriş yenilendi → 2. denemede başarılı' }]);
    } finally { await r.kapat(); }
  });
});

test('sonuç deposu: ekran sonucunun kurtarma notu detayda ve koşu listesinde; kurtarma_json yalnız kimlik / durum / deneme; sayaç', async () => {
  const vt = await veritabaniniHazirla(null);
  try {
    const projeId = projeKaydet(vt, { ad: 'Sonuç projesi' });
    kosuKaydet(vt, { id: 'kosu-1', projeId, tur: 'tam' });
    const not = { kuralId: 'kural-1', kural: 'Geçici sorun', adim: 'Gönder', durum: 'kurtarildi', deneme: 2, not: 'kurtarıldı: metin "Geçici sorun" → sayfa yenilendi → 2. denemede başarılı' };
    const { id } = sonucKaydet(vt, { kosuId: 'kosu-1', projeId, senaryoBaslik: 'İşlem', durum: 'basarili', baslangic: new Date().toISOString(),
      kurtarma: [not, { kuralId: 'gecersiz kimlik!', durum: 'kurtarildi' }, { kuralId: 'kural-2', durum: 'bilinmiyor' }] });
    expect(sonucDetayi(vt, id)?.kurtarma).toEqual([not]);
    expect(kosuDetayi(vt, 'kosu-1')?.sonuclar[0].kurtarma).toEqual([not]);
    expect(JSON.parse(String(vt.tek('SELECT kurtarma_json FROM kosu_sonuclari WHERE id = ?', [id])?.kurtarma_json))).toEqual([{ kuralId: 'kural-1', durum: 'kurtarildi', deneme: 2 }]);
    expect(kurtarmaSayaclari(vt, projeId, { bas: new Date(Date.now() - 86_400_000) })).toEqual({ 'kural-1': { toplam: 1, kurtarildi: 1, kaldi: 0, tekrarlanmadi: 0, denendi: 0 } });
    // Kural çalışmayan sonuçta sütun boş kalır.
    const b = sonucKaydet(vt, { kosuId: 'kosu-1', projeId, senaryoBaslik: 'Diğer', durum: 'basarili' });
    expect(vt.tek('SELECT kurtarma_json FROM kosu_sonuclari WHERE id = ?', [b.id])?.kurtarma_json ?? null).toBeNull();
    expect(sonucDetayi(vt, b.id)?.kurtarma).toEqual([]);
  } finally { vt.kapat(); }
});

test('akış tasarımı: "Tekrar denenebilir" işareti alan grubunda / aksiyonda → modelde kosu.tekrarDenenebilir; gidiş-dönüş kararlı; doğrulayıcı ve model farkı', () => {
  const m = model('/metin');
  const META = { ekranAnahtari: 'islem', ekranAdi: 'İşlem', urlYolu: '/metin', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
  const bloklar = (x: Nesne): AkisBlogu[] => JSON.parse(JSON.stringify(adimlardanBloklar(x, x.adimlar, modeldenAkisEnvanteri(x)))) as AkisBlogu[];
  const modele = (x: Nesne, b: AkisBlogu[]): Nesne => {
    const ayik = bloklariAyikla(JSON.parse(JSON.stringify(b)));
    expect(ayik.hatalar).toEqual([]);
    const c = akistanKayitEnvanteri(modeldenAkisEnvanteri(x), ayik.bloklar, { korunanlar: korunanParcalari(x).parcalar });
    expect(c.hatalar).toEqual([]);
    return (kayitPaketiOlustur({ ...META, mevcutModel: x }, c.envanter as NonNullable<typeof c.envanter>).paket as Nesne).model as Nesne;
  };
  const b = bloklar(m);
  expect(b.some((x) => 'tekrarDenenebilir' in x)).toBe(false);
  const i = b.findIndex((x) => x.tur === 'alanlar' || (x.tur === 'aksiyon' && !x.istegeBagli));
  const isaretli = b.map((x, k) => (k === i ? { ...x, tekrarDenenebilir: true } : x)) as AkisBlogu[];
  const yeni = modele(m, isaretli);
  expect(yeni.adimlar.every((a: Nesne) => a.kosu?.tekrarDenenebilir === true)).toBe(true);
  expect(() => ekranModeliniDogrula('islem.model.json', yeni, () => { throw new Error('yok'); })).not.toThrow();
  expect(bloklar(yeni)[i]).toMatchObject({ tekrarDenenebilir: true });
  // İşaret kaldırılınca modelden de kalkar.
  const kaldirilan = modele(yeni, bloklar(yeni).map((x) => { const { tekrarDenenebilir: _t, ...geri } = x as AkisBlogu & { tekrarDenenebilir?: boolean }; return geri as AkisBlogu; }));
  expect(JSON.stringify(kaldirilan.adimlar)).not.toContain('tekrarDenenebilir');
  const hatali = JSON.parse(JSON.stringify(m)) as Nesne;
  hatali.adimlar[0].kosu.tekrarDenenebilir = 'evet';
  expect(() => ekranModeliniDogrula('islem.model.json', hatali, () => { throw new Error('yok'); })).toThrow('"tekrarDenenebilir" true ya da false olmalı');
  expect(kosuTanimiFarki(m.adimlar[0].kosu, yeni.adimlar[0].kosu)).toContain('tekrar denenebilir: kapalı → açık');
});
