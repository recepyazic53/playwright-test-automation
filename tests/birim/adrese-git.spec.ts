// "ŞU ADRESE GİT" (modelde kosu.aksiyonlar: { tur: 'git', yol: '/x' }) ve kayıttaki adres değişimlerinin taslağa yerleşmesi.
// Kullanıcı kayıt sırasında adres çubuğuyla (ya da bağlantıyla) başka sayfaya gidip orada alan doldurabilir; Nöbetçi bu sayfa
// geçişlerini olay sırasına göre "adrese git" bloğu yapar. Saf testler: yol kuralı, gezinme planı (hangisi adım, hangisi neden değil),
// taslak yerleşimi (çift blok yok; alanlar doğru sayfada), doğrulayıcı (geçerli / geçersiz yol), diyagram gidiş-dönüşü, model farkı
// etiketi, Playwright dışa aktarma; koşucu (127.0.0.1'de 3 sahte sayfa) gidilen sayfada devam eder. Nötr fikstür; değerler sahte.
import { expect, test, type Browser } from '@playwright/test';
import { ekranModeliniDogrula, gezinmeYolu as dogrulayiciYolu, gitYoluHatasi } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { gezinmeYolu, gitYoluHatasi as ortakYolHatasi } from '../../scripts/dogrulama/gezinme-yolu.mjs';
import { adimlardanBloklar, korunanParcalari, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { kosuTanimiMetni } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { playwrightKoduUret } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import { akisTaslagi, akistanKayitEnvanteri, bloklariAyikla, type AkisBlogu, type AkisEnvanteri, type AkisOkumasi, type Gezinme } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { gezinmeOzetMetni, gezinmePlani, gezinmeUyarilari } from '../../scripts/platform/tarama/gezinme-plani.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;

// ---- Yol kuralı ---------------------------------------------------------------------------------------------------------------

test('yol kuralı: yalnız aynı ortamın yolu; tam adres / başka site / gizli sorgu reddedilir ya da atılır; yol gibi parça korunur', () => {
  // Giriş kaydının kuralı ile doğrulayıcının kuralı aynı işlevdir.
  expect(dogrulayiciYolu).toBe(gezinmeYolu);
  expect(gitYoluHatasi).toBe(ortakYolHatasi);
  expect([
    gezinmeYolu('/a'), gezinmeYolu('/a?x=1'), gezinmeYolu('/a?x=1#p'), gezinmeYolu('/a#/rota'), gezinmeYolu('/a#!/rota?x=1'),
    gezinmeYolu('/a?token=1'), gezinmeYolu('/a?ok=1&oturum=2'), gezinmeYolu(`/a?x=${'y'.repeat(120)}`), gezinmeYolu('/a#/r?sifre=1')
  ]).toEqual(['/a', '/a?x=1', '/a?x=1', '/a#/rota', '/a#!/rota?x=1', '/a', '/a', '/a', '/a']);
  expect([gezinmeYolu('http://x/a'), gezinmeYolu('//x/a'), gezinmeYolu('a'), gezinmeYolu(''), gezinmeYolu(3), gezinmeYolu('/a b'), gezinmeYolu('/a\\b')]).toEqual(['', '', '', '', '', '', '']);
  // Model yolu kayıttakiyle birebir aynı olmalı (kural kaydetmeden dönüştürmeden önce sınar).
  for (const gecerli of ['/', '/liste', '/liste?durum=aktif', '/rota#/ozet']) expect(gitYoluHatasi(gecerli), gecerli).toBeNull();
  expect(gitYoluHatasi('https://baska.site/x')).toContain('"/" ile başlayan');
  expect(gitYoluHatasi('//baska.site/x')).toContain('"/" ile başlayan');
  expect(gitYoluHatasi('liste')).toContain('"/" ile başlayan');
  expect(gitYoluHatasi('')).toContain('"yol" zorunlu');
  expect(gitYoluHatasi(5)).toContain('"yol" zorunlu');
  expect(gitYoluHatasi('/x?token=abc')).toContain('gizli değer çağrıştıran');
  expect(gitYoluHatasi(`/x?a=${'b'.repeat(120)}`)).toContain('uzun bir sorgu');
  expect(gitYoluHatasi('/x#bolum')).toContain('yol olmayan bir parça');
  expect(gitYoluHatasi('/a b')).toContain('boşluk');
});

// ---- Gezinme planı ------------------------------------------------------------------------------------------------------------

const oku = (yol: string, gorunen: string[], dokunulan: string[] = []): AkisOkumasi => ({ yol, gorunen, dokunulan, secimler: {} });
const alan = (anahtar: string, etiket: string, ek: Partial<HamAlan> = {}): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Genel' }, ...ek
});
/** Üç sayfalı kayıt: /a (ad + Gönder) → /b (kod + Gönder) → /c. */
function envanter(gezinmeler: Gezinme[], ek: Partial<AkisEnvanteri> = {}, sayfa: [string, string] = ['/a', '/b']): AkisEnvanteri {
  return {
    kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Sayfa',
    alanlar: [{ alan: alan('#ad', 'Ad'), secili: true }, { alan: alan('#kod', 'Kod'), secili: true }],
    dugmeler: [{ secici: '#g1', metin: 'Gönder' }, { secici: '#g2', metin: 'Gönder' }],
    mesajlar: [], engellenenler: [], notlar: [],
    olaylar: [
      { tur: 'okuma', elle: false, okuma: oku(sayfa[0], ['#ad']) }, // 0
      { tur: 'tik', dugme: 0, oncesi: oku(sayfa[0], ['#ad'], ['#ad']) }, // 1
      { tur: 'okuma', elle: false, okuma: oku(sayfa[1], ['#kod']) }, // 2
      { tur: 'tik', dugme: 1, oncesi: oku(sayfa[1], ['#kod'], ['#kod']) } // 3
    ],
    gezinmeler, ...ek
  };
}
const adres = (sira: number, yol: string, kaynak: NonNullable<Gezinme['kaynak']> = 'adresCubugu'): Gezinme => ({ sira, yol, elle: kaynak === 'adresCubugu', kaynak });

test('gezinme planı: adres çubuğu ve kaydedilmeyen öğeye tıklama adım olur; aynı sayfa, tıklamayla açılan, otomatik yönlendirme, başka site, yeni pencere adım olmaz', () => {
  const g = [
    adres(2, '/b'), // yazarak gidildi → adım
    adres(2, '/b', 'yenileme'), // yenileme → aynı sayfa
    adres(3, '/b', 'adresCubugu'), // aynı adrese yeniden yazıldı → aynı sayfa
    adres(4, '/b?durum=aktif'), // yalnız sorgu değişti → adım
    adres(5, '/b?durum=aktif#/ozet'), // parça (yol gibi) değişti → adım
    adres(6, '/c', 'etkilesim'), // betikle yönlenen menü → adım
    adres(7, '/d', 'tik'), // kayıtlı düğme / bağlantı tıklaması → oynatmada tıklama zaten gider
    adres(8, '/e', 'yonlendirme'), // otomatik
    adres(9, '/c', 'geriIleri') // geri: /e'den /c'ye (önceki sayfa /e) → adım
  ];
  const p = gezinmePlani(envanter(g, {
    atlananGezinmeler: [{ sira: 5, koken: 'https://baska.ornek.test', neden: 'baskaSite' }],
    pencereler: [{ sira: 6, olay: 'acildi', yol: '/pencere' }, { sira: 7, olay: 'kapandi', yol: '' }]
  }));
  expect(p.adimlar).toEqual([
    { sira: 2, yol: '/b' }, { sira: 4, yol: '/b?durum=aktif' }, { sira: 5, yol: '/b?durum=aktif#/ozet' }, { sira: 6, yol: '/c' }, { sira: 9, yol: '/c' }
  ]);
  expect(p.ozet).toMatchObject({ toplam: 11, adim: 5, atlanan: { ayniSayfa: 2, baskaSite: 1, otomatik: 1, tiklama: 1, yeniPencere: 1 } });
  expect(gezinmeOzetMetni(p.ozet)).toBe('Kayıtta 11 adres değişimi görüldü: 5 tanesi adım oldu, 6 tanesi alınmadı '
    + '(nedeni — aynı sayfa: 2; başka site: 1; otomatik yönlendirme: 1; tıklamayla açıldı, oynatmada tıklama zaten gider: 1; yeni pencere: 1).');
  expect(gezinmeUyarilari(p.ozet)).toEqual(['Şu siteye gidildi: https://baska.ornek.test; ortamın adresi dışında olduğu için alınmadı.']);
  // Her zaman bir satır: adres değişimi yoksa da söylenir.
  expect(gezinmeOzetMetni(gezinmePlani(envanter([])).ozet)).toBe('Kayıtta adres değişimi görülmedi.');
  // Kayıt başladığı sayfa yeni sayfa sayılmaz; gizli sorgu yoldan atılır; geçersiz yol adım olmaz.
  expect(gezinmePlani(envanter([adres(1, '/a'), adres(2, '/b?token=1'), adres(3, 'http://x/y'), adres(4, '//x/y')])).adimlar).toEqual([{ sira: 2, yol: '/b' }]);
  // Eski kayıt (kaynak yok): "elle" adres çubuğu sayılır, değilse otomatik.
  const eski = gezinmePlani(envanter([{ sira: 2, yol: '/b', elle: true }, { sira: 3, yol: '/c', elle: false }]));
  expect(eski.adimlar).toEqual([{ sira: 2, yol: '/b' }]);
  expect(eski.ozet.atlanan.otomatik).toBe(1);
});

// ---- Taslak yerleşimi ---------------------------------------------------------------------------------------------------------

test('taslak: adres değişimi olay sırasına yerleşir; önceki sayfanın alanları önce, sonraki sayfanın alanları o adrese göre gelen adımda; çift blok yok', () => {
  const t = akisTaslagi(envanter([adres(2, '/b'), adres(4, '/c')]));
  expect(t.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'git', 'alanlar', 'aksiyon', 'git', 'bitir']);
  expect(t[0]).toMatchObject({ tur: 'alanlar', alanlar: ['#ad'] });
  expect(t[2]).toEqual({ tur: 'git', yol: '/b' });
  expect(t[3]).toMatchObject({ tur: 'alanlar', alanlar: ['#kod'] });
  expect(t[5]).toEqual({ tur: 'git', yol: '/c' });
  // Yenileme, aynı adrese dönüş ve kayıt başladığı sayfa çift blok üretmez; otomatik yönlendirme ve tıklamayla açılan da üretmez.
  const cift = akisTaslagi(envanter([
    adres(0, '/a'), adres(2, '/b'), adres(2, '/b'), adres(2, '/b', 'yenileme'), adres(3, '/b'), adres(4, '/x', 'yonlendirme'), adres(4, '/y', 'tik'), adres(4, '/c')
  ]));
  expect(cift.filter((b) => b.tur === 'git')).toEqual([{ tur: 'git', yol: '/b' }, { tur: 'git', yol: '/c' }]);
  // Adres değişimi dokunulan alanlar arasına düşerse alanlar doğru sayfanın adımına girer (sıra bozulmaz).
  const arada: AkisEnvanteri = envanter([adres(1, '/b')], {
    olaylar: [
      { tur: 'okuma', elle: false, okuma: oku('/a', ['#ad'], ['#ad']) }, // 0: /a'da Ad'a dokunuldu
      { tur: 'okuma', elle: false, okuma: oku('/b', ['#kod'], ['#ad', '#kod']) }, // 1: /b'de Kod'a dokunuldu (dokunulan birikimlidir)
      { tur: 'tik', dugme: 1, oncesi: oku('/b', ['#kod'], ['#ad', '#kod']) }
    ]
  });
  expect(akisTaslagi(arada)).toEqual([
    expect.objectContaining({ tur: 'alanlar', alanlar: ['#ad'] }), { tur: 'git', yol: '/b' },
    expect.objectContaining({ tur: 'alanlar', alanlar: ['#kod'] }), { tur: 'aksiyon', dugme: 1, istegeBagli: false }, { tur: 'bitir' }
  ]);
  // Adres değişimi hiç yoksa taslak eskisiyle aynı (git bloğu yok).
  expect(akisTaslagi(envanter([])).some((b) => b.tur === 'git')).toBe(false);
  // Kayıt sonunda gidilen sayfa (son olaydan sonra) da blok olur.
  expect(akisTaslagi(envanter([adres(4, '/z')])).slice(-2)).toEqual([{ tur: 'git', yol: '/z' }, { tur: 'bitir' }]);
});

// ---- Doğrulayıcı --------------------------------------------------------------------------------------------------------------

function model(aksiyonlar: Nesne[]): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'gezinti', ad: 'Gezinti', aciklama: 'Adrese git (nötr fikstür; değerler sahte).',
    ekranUrl: '/adim-1', girisGerekmez: true, specDosyasi: 'tests/scenarios/gezinti/gezinti.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (gezinti)' }, kosullar: {},
    // Yalnızca sayfa değiştiren ("git") adım alansızdır (bölümü boş olabilir); diğerleri bir düğme bölümü taşır.
    adimlar: [{
      id: 'gezin', sira: 1, baslik: 'Gezin',
      bolumler: aksiyonlar.some((a) => a.tur === 'git') ? [] : [{ id: 'islemler', baslik: 'İşlemler', alanlar: [{ id: 'dugme', tip: 'buton', etiket: { ekran: 'Devam' }, yapilandirma: 'aksiyon', konum: { secici: '#a', kirilganlik: 'orta' } }] }],
      kosu: { aksiyonlar }
    }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const dogrula = (m: Nesne): string => { try { ekranModeliniDogrula('gezinti.model.json', m, () => { throw new Error('yok'); }); return ''; } catch (e) { return (e as Error).message; } };

test('doğrulayıcı: "git" aksiyonu geçerli yolla geçer; mutlak adres, başka site, gizli sorgu, seçici ve yanlış yerde "yol" reddedilir; mevcut modeller değişmeden geçerli', () => {
  for (const yol of ['/liste', '/liste?durum=aktif', '/rota#/ozet', '/']) expect(dogrula(model([{ tur: 'git', yol }])), yol).toBe('');
  expect(dogrula(model([{ tur: 'git', yol: '/x', aciklama: 'Listeye git', zamanAsimiSn: 5 }]))).toBe('');
  expect(dogrula(model([{ tur: 'git', yol: 'https://baska.site/x' }]))).toContain('"git" aksiyonunda "yol" "/" ile başlayan');
  expect(dogrula(model([{ tur: 'git', yol: '//baska.site/x' }]))).toContain('"/" ile başlayan');
  expect(dogrula(model([{ tur: 'git', yol: 'liste' }]))).toContain('"/" ile başlayan');
  expect(dogrula(model([{ tur: 'git' }]))).toContain('"yol" zorunlu');
  expect(dogrula(model([{ tur: 'git', yol: '/x?token=abc' }]))).toContain('gizli değer çağrıştıran');
  expect(dogrula(model([{ tur: 'git', yol: `/x?${'a=b&'.repeat(30)}` }]))).toContain('uzun bir sorgu');
  expect(dogrula(model([{ tur: 'git', yol: '/x', secici: '#a' }]))).toContain('"git" aksiyonunda yalnız "yol"');
  expect(dogrula(model([{ tur: 'git', yol: '/x', kosul: 'gorunurse' }]))).toContain('"git" aksiyonunda yalnız "yol"');
  expect(dogrula(model([{ tur: 'tikla', secici: '#a', yol: '/x' }]))).toContain('"yol" yalnızca "git" aksiyonunda olur');
  expect(dogrula(model([{ tur: 'gec', yol: '/x' }]))).toContain('"tur" tikla | bekle | ekranaDon | git olmalı');
  // Geriye uyum: eski aksiyon türleri aynen geçerli.
  expect(dogrula(model([{ tur: 'tikla', secici: '#a' }, { tur: 'bekle', sureSn: 2 }, { tur: 'ekranaDon' }]))).toBe('');
  // Sayfa paketi doğrulayıcısı da aynı kuralı uygular.
  const paket = (m: Nesne): Nesne => ({
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: m.id, ad: m.ad, urlYolu: m.ekranUrl }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür.' },
    model: m, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  });
  expect(sayfaPaketiniDogrula(paket(model([{ tur: 'git', yol: '/x' }]))).hatalar).toEqual([]);
  expect(sayfaPaketiniDogrula(paket(model([{ tur: 'git', yol: 'https://baska.site/x' }]))).hatalar.length).toBeGreaterThan(0);
});

// ---- Diyagram ↔ model ---------------------------------------------------------------------------------------------------------

const META = { ekranAnahtari: 'gezinti', ekranAdi: 'Gezinti', urlYolu: '/adim-1', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
/** Adım 1: /adim-1 (Ad + Gönder1) · Adım 2: /adim-2 (Kod + Gönder2) · Adım 3: /adim-3 (yalnız sonuç yazısı). */
function uclu(): AkisEnvanteri {
  return envanter([adres(2, '/adim-2'), adres(4, '/adim-3')], {
    alanlar: [{ alan: alan('#ad', 'Ad'), secili: true }, { alan: alan('#kod', 'Kod'), secili: true }],
    dugmeler: [{ secici: '#gonder1', metin: 'Gönder' }, { secici: '#gonder2', metin: 'Gönder' }],
    mesajlar: [{ secici: '#son', metin: 'Üçüncü sayfa hazır' }]
  }, ['/adim-1', '/adim-2']);
}
function modeleCevir(env: AkisEnvanteri, bloklar: AkisBlogu[], mevcut?: Nesne): { model: Nesne; paket: Nesne; hatalar: string[] } {
  const ayik = bloklariAyikla(kopya(bloklar));
  expect(ayik.hatalar).toEqual([]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar, mevcut ? { korunanlar: korunanParcalari(mevcut).parcalar } : {});
  if (!c.envanter) return { model: {}, paket: {}, hatalar: c.hatalar.map((h) => h.mesaj) };
  const p = kayitPaketiOlustur({ ...META, ...(mevcut ? { mevcutModel: mevcut } : {}) }, c.envanter).paket as Nesne;
  return { model: p.model as Nesne, paket: p, hatalar: [] };
}
const kosuAksiyonlari = (m: Nesne): Array<Nesne[] | null> => (m.adimlar as Nesne[]).map((a) => a.kosu?.aksiyonlar ?? null);

test('diyagram: kayıt taslağı → model (her adres değişimi kendi adımı; gidilen sayfada devam) → geçerli; model → blok → model kararlı; elle ekleme / düzenleme / silme', () => {
  const env = uclu();
  const taslak = akisTaslagi(env);
  // Son sayfada beklenen mesaj: git adımına bağlanır (gidilen sayfada aranır).
  const bloklar = [...taslak.slice(0, -1), { tur: 'mesaj', mesaj: 0, metin: 'Üçüncü sayfa hazır' } as AkisBlogu, { tur: 'bitir' } as AkisBlogu];
  expect(bloklar.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'git', 'alanlar', 'aksiyon', 'git', 'mesaj', 'bitir']);
  const r = modeleCevir(env, bloklar);
  expect(r.hatalar).toEqual([]);
  expect(dogrula(r.model)).toBe('');
  expect(sayfaPaketiniDogrula(r.paket).hatalar).toEqual([]);
  const adimlar = r.model.adimlar as Nesne[];
  expect(adimlar.map((a) => a.baslik)).toEqual(['Sayfa', 'Adrese git: /adim-2', 'Sayfa (2)', 'Adrese git: /adim-3']);
  expect(kosuAksiyonlari(r.model)).toEqual([
    [{ tur: 'tikla', secici: '#gonder1', aciklama: 'Gönder' }], [{ tur: 'git', yol: '/adim-2' }],
    [{ tur: 'tikla', secici: '#gonder2', aciklama: 'Gönder' }], [{ tur: 'git', yol: '/adim-3' }]
  ]);
  expect(adimlar[1].bolumler).toEqual([]);
  // Beklenen mesaj gidilen sayfada (git adımının başarı göstergesi); önceki tıklama adımlarının göstergesi gidilen sayfaya bakmaz.
  expect(adimlar[3].kosu.basariGostergesi).toEqual({ tur: 'metin', deger: 'Üçüncü sayfa hazır', secici: '#son' });
  expect(adimlar[0].kosu.basariGostergesi).toBeUndefined();
  // Model → blok: "git" adımları git bloğudur (korunan değil); blok → model → blok kararlı.
  const geri = kopya(adimlardanBloklar(r.model, r.model.adimlar, modeldenAkisEnvanteri(r.model)));
  expect(geri.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'git', 'alanlar', 'aksiyon', 'git', 'mesaj', 'bitir']);
  expect(geri.filter((b) => b.tur === 'git')).toEqual([{ tur: 'git', yol: '/adim-2' }, { tur: 'git', yol: '/adim-3' }]);
  const yine = modeleCevir(modeldenAkisEnvanteri(r.model), geri, r.model);
  expect(yine.hatalar).toEqual([]);
  expect(kosuAksiyonlari(yine.model)).toEqual(kosuAksiyonlari(r.model));
  // Kullanıcı git bloğunu kaldırır (varsayılan işaretli; silinebilir): adım modelden çıkar.
  const silinmis = modeleCevir(env, bloklar.filter((b) => !(b.tur === 'git' && b.yol === '/adim-2')));
  expect(silinmis.hatalar).toEqual([]);
  expect(JSON.stringify(kosuAksiyonlari(silinmis.model))).not.toContain('/adim-2');
  // Elle ekleme / düzenleme: yol değiştirilebilir; geçersiz yol blokta hata verir (mutlak adres, başka site).
  const duzenli = bloklar.map((b) => (b.tur === 'git' && b.yol === '/adim-3' ? { ...b, yol: '/adim-3?durum=aktif' } : b));
  expect(kosuAksiyonlari(modeleCevir(env, duzenli).model).at(-1)).toEqual([{ tur: 'git', yol: '/adim-3?durum=aktif' }]);
  const eklenmis = modeleCevir(env, [bloklar[0], bloklar[1], { tur: 'git', yol: '/elle' }, ...bloklar.slice(2)]);
  expect(eklenmis.hatalar).toEqual([]);
  expect(kosuAksiyonlari(eklenmis.model)[1]).toEqual([{ tur: 'git', yol: '/elle' }]);
  for (const kotu of ['https://baska.site/x', '//baska.site/x', 'liste', '']) {
    expect(modeleCevir(env, bloklar.map((b) => (b.tur === 'git' && b.yol === '/adim-2' ? { ...b, yol: kotu } : b))).hatalar.join(' '), kotu).toContain('Şu adrese git:');
  }
  // Aynı yol iki kez: adım adları tekil kalır.
  const ikili = modeleCevir(env, [bloklar[0], bloklar[1], { tur: 'git', yol: '/adim-2' }, { tur: 'git', yol: '/adim-2' }, ...bloklar.slice(2)]);
  expect(ikili.hatalar).toEqual([]);
  expect((ikili.model.adimlar as Nesne[]).map((a) => a.baslik).slice(0, 4)).toEqual(['Sayfa', 'Adrese git: /adim-2', 'Adrese git: /adim-2 (2)', 'Adrese git: /adim-2 (3)']);
  // İlerleme düğmesiz alan grubundan sonra adres değişimi geçerli (adres çubuğuyla gidildi).
  const duğmesiz = modeleCevir(env, [bloklar[0], { tur: 'git', yol: '/adim-2' }, bloklar[3], { tur: 'bitir' }]);
  expect(duğmesiz.hatalar).toEqual([]);
  expect((duğmesiz.paket.bilinmeyenler as string[]).join(' ')).not.toContain('ilerleme düğmesi kaydedilmedi');
});

test('gösterim: model farkı "adrese git: /x"; Playwright dışa aktarma page.goto ile ortamın adresine göre açar; korunan aksiyon özeti', () => {
  expect(kosuTanimiMetni({ aksiyonlar: [{ tur: 'git', yol: '/x' }] })).toContain('adrese git: /x');
  const m = model([{ tur: 'git', yol: '/adim-2?durum=aktif' }]);
  const plan = modelKosuPlani(m, {});
  expect(plan.hatalar).toEqual([]);
  const r = playwrightKoduUret({
    plan, kaynak: { ekran: 'Gezinti', senaryo: 'Adrese git', modelSurumu: 1, ortam: 'TEST', uretim: '2026-09-28T10:00:00.000Z' },
    tabanUrl: 'http://127.0.0.1:9', girisGerekli: false, girisProfili: null, tarif: null, baglam: null,
    gizlilik: { hassasAnahtarlar: [], gizliDegerler: [], kisiselAlanIdleri: [], ekGizliAdlar: [] }
  });
  expect(r.icerik).toContain('await page.goto("/adim-2?durum=aktif", { waitUntil: \'domcontentloaded\' });');
  // Karışık (tıklama + git aynı adımda; elle yazılmış model): diyagramda gösterilemez, korunan aksiyon olarak aynen kalır.
  const karisik = model([{ tur: 'tikla', secici: '#a' }, { tur: 'git', yol: '/x' }]);
  const b = kopya(adimlardanBloklar(karisik, karisik.adimlar, modeldenAkisEnvanteri(karisik)));
  expect(b.map((x) => x.tur)).toContain('korunan');
  expect(b.map((x) => x.tur)).not.toContain('git');
  expect(JSON.stringify(b)).toContain('Şu adrese git: /x');
});

// ---- Koşucu: 127.0.0.1'deki 3 sahte sayfa -------------------------------------------------------------------------------------

const SAYFALAR: Record<string, string> = {
  '/adim-1': `<h1>Birinci sayfa</h1><label>Ad <input id="ad"></label><button type="button" id="gonder1">Gönder</button><p id="sonuc1"></p>
<script>document.getElementById('gonder1').addEventListener('click', () => { document.getElementById('sonuc1').textContent = 'Birinci adım tamam'; fetch('/kayit', { method: 'POST', body: JSON.stringify({ sayfa: 1, ad: document.getElementById('ad').value }) }); });</script>`,
  '/adim-2': `<h1>İkinci sayfa</h1><label>Kod <input id="kod"></label><button type="button" id="gonder2">Gönder</button><p id="sonuc2"></p>
<script>document.getElementById('gonder2').addEventListener('click', () => { document.getElementById('sonuc2').textContent = 'İkinci adım tamam'; fetch('/kayit', { method: 'POST', body: JSON.stringify({ sayfa: 2, kod: document.getElementById('kod').value }) }); });</script>`,
  '/adim-3': '<h1>Üçüncü sayfa</h1><p id="son">Üçüncü sayfa hazır</p>'
};

test.describe('koşucu: gidilen sayfada devam eder', () => {
  let tarayici: Browser;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  const gelen: string[] = [];
  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      gelen.push(`${i.yontem} ${i.yol}`);
      if (i.yol === '/kayit' && i.yontem === 'POST') { gelen.push(i.govde); return { tur: 'text/plain', govde: 'ok' }; }
      const s = SAYFALAR[i.yol.split('?')[0]];
      return s ? { tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Sayfa</title></head><body>${s}</body></html>` } : { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  test('kayıttan çıkan model: sayfa 1 doldurulur ve gönderilir → adrese git → sayfa 2 doldurulur ve gönderilir → adrese git → sayfa 3 yazısı görülür', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const env = uclu();
    const bloklar = [...akisTaslagi(env).slice(0, -1), { tur: 'mesaj', mesaj: 0, metin: 'Üçüncü sayfa hazır' } as AkisBlogu, { tur: 'bitir' } as AkisBlogu];
    const { model: m, hatalar } = modeleCevir(env, bloklar);
    expect(hatalar).toEqual([]);
    const senaryo = (mm: Nesne): PlatformModelSenaryosu => {
      const id = (secici: string): string => String((mm.adimlar as Nesne[]).flatMap((a) => a.bolumler).flatMap((b: Nesne) => b.alanlar).find((x: Nesne) => x.konum?.secici === secici).id);
      return { id: 's1', baslik: 'Üç sayfa', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'gezinti', ad: 'Gezinti' }, model: mm, modelSurumu: 1, altModeller: {}, veri: { [id('#ad')]: 'Deniz Ak', [id('#kod')]: 'K-77' }, mutlakaGorunmeli: [] };
    };
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
      tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
    };
    try {
      await modelSenaryosunuKos(page, testInfo, senaryo(m), ortam);
      // Zincir sırayla yürüdü: sayfa 1 (gönderim) → sayfa 2 (gönderim) → sayfa 3; ekran ikinci kez açılmadı.
      expect(gelen.filter((g) => g.startsWith('GET /adim'))).toEqual(['GET /adim-1', 'GET /adim-2', 'GET /adim-3']);
      expect(gelen).toContain(JSON.stringify({ sayfa: 1, ad: 'Deniz Ak' }));
      expect(gelen).toContain(JSON.stringify({ sayfa: 2, kod: 'K-77' }));
      expect(new URL(page.url()).pathname).toBe('/adim-3');
      await expect(page.locator('#son')).toHaveText('Üçüncü sayfa hazır');
    } finally { await baglam.close(); }
  });

  test('gidilen sayfada beklenen yazı yoksa koşu düşer (git adımı gerçekten gidilen sayfayı doğrular); ortam kökenine göre yol: başka siteye gitmez', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const env = uclu();
    const bloklar = [...akisTaslagi(env).slice(0, -1), { tur: 'mesaj', mesaj: null, metin: 'Bu yazı hiçbir sayfada yok' } as AkisBlogu, { tur: 'bitir' } as AkisBlogu];
    const { model: m } = modeleCevir(env, bloklar);
    const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
      tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
    };
    const s: PlatformModelSenaryosu = { id: 's2', baslik: 'Düşen', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'gezinti', ad: 'Gezinti' }, model: m, modelSurumu: 1, altModeller: {}, veri: {}, mutlakaGorunmeli: [] };
    try {
      let hata = '';
      try { await modelSenaryosunuKos(page, testInfo, s, ortam); } catch (e) { hata = (e as Error).message; }
      expect(hata).not.toBe('');
      expect(new URL(page.url()).origin).toBe(new URL(sunucu.adres).origin);
      expect(new URL(page.url()).pathname).toBe('/adim-3');
    } finally { await baglam.close(); }
  });
});
