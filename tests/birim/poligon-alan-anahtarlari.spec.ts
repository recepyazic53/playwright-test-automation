// POLİGON DÜZELTMESİ 3 — sayfadaki alan kimliği "baslik" ise (ör. <input id="baslik"> "Adres başlığı") senaryonun BAŞLIK alanı sanılmaz:
// sayfa alanlarının kimliği / senaryo anahtarı senaryonun meta anahtarlarıyla çakışmaz ("alanBaslik"); yeniden kaydedilen eski modelde
// çakışan alan yeni anahtar alır. Ayrıca aksiyonun pencere yanıtı ("diyalog") pakete ve doğrulayıcıya geçer. Saf dönüşüm (tarayıcı YOK).
import { expect, test } from '@playwright/test';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { kayitPaketiOlustur, type HamAlan, type KayitEnvanteri, type PaketMetasi } from '../../scripts/platform/tarama/paket-olusturucu.mjs';

type Nesne = Record<string, any>;
const bolum = { anahtar: 'genel', baslik: 'Genel' };
const ham = (id: string, etiket: string): HamAlan => ({
  anahtar: `#${id}`, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: id, ad: null, secici: `#${id}`, kirilganlik: 'dusuk', adaySeciciler: [`#${id}`],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum
});
const META: PaketMetasi = { ekranAnahtari: 'adres', ekranAdi: 'Adres', urlYolu: '/adres/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok', baglamTuru: null };
const envanter = (): KayitEnvanteri => ({
  kip: 'kayit', profil: null, engellenenler: [], notlar: [],
  adimlar: [{ ad: 'Form', yol: '/adres/', baslik: 'Adres', alanlar: [ham('baslik', 'Adres başlığı'), ham('mahalle', 'Mahalle')], ilerleme: { secici: '#kaydet', metin: 'Kaydet', diyalog: 'kabul' } }],
  basariGostergesi: { secici: null, metin: 'Adres kaydedildi', aranan: 'Adres kaydedildi' }
});
const alanlar = (m: Nesne): Nesne[] => (m.adimlar as Nesne[]).flatMap((a) => a.bolumler).flatMap((b: Nesne) => b.alanlar);

test('id="baslik" alanı senaryo başlığıyla çakışmaz: kimlik ve senaryo anahtarı "alanBaslik"; formun başlık anahtarı ayrı kalır', () => {
  const { paket } = kayitPaketiOlustur(META, envanter());
  const m = (paket as Nesne).model as Nesne;
  const a = alanlar(m).find((x) => x.konum?.secici === '#baslik');
  expect(a).toMatchObject({ id: 'alanBaslik', eslesme: { senaryo: 'alanBaslik' } });
  const form = formSemasiOlustur(m);
  expect(form.baslik).toBe('baslik');
  expect(Object.values(form.alanAnahtarlari ?? {}).map((x: Nesne) => x.anahtar)).toContain('alanBaslik');
  expect(sayfaPaketiniDogrula(paket as Nesne).gecerli).toBe(true);
});

test('eski modelde "baslik" anahtarlı sayfa alanı yeniden kaydedilince yeni anahtar alır (göç gerekmez)', () => {
  const eski = (kayitPaketiOlustur(META, envanter()).paket as Nesne).model as Nesne;
  // Eski sürümün ürettiği model: alanın kimliği ve senaryo anahtarı "baslik".
  const a = alanlar(eski).find((x) => x.konum?.secici === '#baslik') as Nesne;
  a.id = 'baslik';
  a.eslesme = { senaryo: 'baslik' };
  const yeni = (kayitPaketiOlustur({ ...META, mevcutModel: eski }, envanter()).paket as Nesne).model as Nesne;
  const b = alanlar(yeni).find((x) => x.konum?.secici === '#baslik');
  expect(b?.eslesme?.senaryo).not.toBe('baslik');
  expect(alanlar(yeni).some((x) => x.eslesme?.senaryo === 'baslik')).toBe(false);
});

test('aksiyonun pencere yanıtı (diyalog) pakete yazılır; doğrulayıcı yalnız tikla + kabul / iptal kabul eder', () => {
  const { paket } = kayitPaketiOlustur(META, envanter());
  const m = (paket as Nesne).model as Nesne;
  expect((m.adimlar as Nesne[])[0].kosu.aksiyonlar).toEqual([{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet', diyalog: 'kabul' }]);
  const bozuk = structuredClone(paket) as Nesne;
  bozuk.model.adimlar[0].kosu.aksiyonlar[0].diyalog = 'belki';
  const d = sayfaPaketiniDogrula(bozuk);
  expect(d.gecerli).toBe(false);
  expect(d.hatalar.map((h: Nesne) => h.mesaj).join(' ')).toContain('"diyalog" yalnızca "tikla" aksiyonunda kabul | iptal olabilir');
});
