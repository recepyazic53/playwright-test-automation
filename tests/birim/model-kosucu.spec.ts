// KORUMA TESTLERİ — model koşucusu (test kodu olmayan senaryolar): model şeması sürüm 2 (adım koşu tanımı,
// okluSecim ok düğmeleri; sürüm 1 aynen geçerli), koşu planı (adım kapsamı, alanlar, beklenen sonuç, bağlam
// profili), model senaryosu tespiti, test başlıkları, yasaklı adres kalıpları, tekrar analizde koşu tanımı
// bulgusu, koşu hedefi (model spec'i + etiket; kodlu testlerden kalan senaryo reddi; yasaklı adres reddi) ve tarayıcıdaki
// yasaklı adres koruması (tarayıcı hiçbir yere gitmeden hata; yasaklı host'a istek iptal). Şirket sitesine
// bağlanmaz: tarayıcı testleri yalnızca 127.0.0.1'deki fikstürle ve DNS kapalı tarayıcıyla çalışır.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { bulgulariUygula, modelFarki } from '../../scripts/platform/ekranlar/model-farki.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { calistirmaIsteginiHazirla } from '../../scripts/platform/senaryolar/calistirma.mjs';
import {
  MODEL_SPEC_DOSYASI, adresYasakliMi, modelEtiketi, modelGrepDeseni, modelKosuPlani, modelSenaryosuMu, modelTestBasliklari, secenekBul,
  yasakDesenleri, yuklemeDosyasiYolu
} from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { calistirmaHedefiCoz, senaryoListesi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import {
  ortamKaydet, projeKaydet, senaryoGetir, senaryoKaydet as depoSenaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { yasakliAdresKorumasi } from '../support/model-kosucu';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { OrnekBasvuruUygulamasi, ornekBasvuruModeli, ornekBasvuruPaketi } from './model-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Nesne = Record<string, unknown>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const dogrula = (model: unknown) => ekranModeliniDogrula('model', model, () => { throw new Error('alt model yok'); });
const oneriVerisi = (i: number): Nesne => {
  const p = ornekBasvuruPaketi();
  const o = (p.senaryoOnerileri as Nesne[])[i];
  return { ...(o.veri as Nesne), onayAdimiDahil: (o.adimKapsami as string[]).includes('onay') };
};

test.describe('Model şeması sürüm 2', () => {
  test('v2 fikstür modeli geçerli; koşu tanımsız v1 model aynen geçerli', () => {
    expect(() => dogrula(ornekBasvuruModeli())).not.toThrow();
    // Sürüm 1: koşu tanımı ve ok düğmeli seçici (yalnızca v2) olmadan aynı ekran.
    const v1 = ornekBasvuruModeli();
    v1.semaSurumu = 1;
    for (const a of v1.adimlar as Nesne[]) delete a.kosu;
    const kapsam = (((v1.adimlar as Nesne[])[0].bolumler as Nesne[])[0].alanlar as Nesne[]).find((a) => a.id === 'kapsam') as Nesne;
    kapsam.tip = 'secim';
    delete kapsam.doldurucu;
    delete kapsam.doldurucuParametreleri;
    kapsam.konum = { secici: '#kapsam-deger', kirilganlik: 'orta' };
    expect(() => dogrula(v1)).not.toThrow();
  });

  test('koşu tanımı yalnızca sürüm 2; aksiyon/gösterge/okluSecim kuralları', () => {
    const v1 = { ...ornekBasvuruModeli(), semaSurumu: 1 };
    expect(() => dogrula(v1)).toThrow(/"kosu"\) "semaSurumu": 2 gerektirir/);
    const m = ornekBasvuruModeli();
    const adimlar = m.adimlar as Nesne[];
    (adimlar[1].kosu as Nesne).aksiyonlar = [{ tur: 'yaz', secici: '' }];
    (adimlar[1].kosu as Nesne).basariGostergesi = { tur: 'url', deger: '(' };
    (adimlar[2].kosu as Nesne).hataGostergesi = { secici: '#x', fazla: 1 };
    const kapsam = ((adimlar[0].bolumler as Nesne[])[0].alanlar as Nesne[]).find((a) => a.id === 'kapsam') as Nesne;
    kapsam.konum = { secici: '#kapsam-deger', kirilganlik: 'orta' };
    let mesaj = '';
    try { dogrula(m); } catch (h) { mesaj = (h as Error).message; }
    expect(mesaj).toContain('"tur" tikla | bekle olmalı');
    expect(mesaj).toContain('"secici" zorunlu');
    expect(mesaj).toContain('"deger" geçerli bir düzenli ifade değil');
    expect(mesaj).toContain('hataGostergesi: { secici } olmalı');
    expect(mesaj).toContain('okluSecim: "konum.yardimci.ileri" (ya da "arttir") seçicisi zorunlu');
    expect(mesaj).toContain('okluSecim: "konum.yardimci.geri" (ya da "azalt") seçicisi zorunlu');
    expect(() => dogrula({ ...ornekBasvuruModeli(), semaSurumu: 3 })).toThrow(/"semaSurumu" 1 ya da 2 olmalı/);
  });

  test('sayfa paketi (v2 modelli) geçerli; beş önerinin hepsi modele uyuyor', () => {
    const d = sayfaPaketiniDogrula(ornekBasvuruPaketi());
    expect(d.hatalar).toEqual([]);
    expect(d.senaryoSorunlari).toEqual([[], [], [], [], []]);
  });

  test('tekrar analiz: adımın koşu tanımı değişikliği bulgu olur; kabul edilince v1 model sürüm 2 olur', () => {
    const yeni = ornekBasvuruModeli();
    const eski = kopya(yeni);
    eski.semaSurumu = 1;
    for (const a of eski.adimlar as Nesne[]) delete a.kosu;
    const bulgular = modelFarki(eski, yeni).filter((b) => b.altTur === 'kosuTanimi');
    expect(bulgular.map((b) => b.adimId)).toEqual(['hesaplama', 'onay']);
    expect(bulgular[0]).toMatchObject({ eski: 'yok', yeni: 'tıkla #hesapla · başarı: metin "Prim:" · hata: #uyari' });
    const r = bulgulariUygula(eski, yeni, [bulgular[0].id]);
    expect(r.model.semaSurumu).toBe(2);
    expect((r.model.adimlar as Nesne[])[1].kosu).toEqual((yeni.adimlar as Nesne[])[1].kosu);
    expect((r.model.adimlar as Nesne[])[2].kosu).toBeUndefined();
    expect(() => dogrula(r.model)).not.toThrow();
  });
});

test.describe('Koşu planı (saf)', () => {
  const model = ornekBasvuruModeli();
  const plan = (i: number, mutlaka: string[] = []) => modelKosuPlani(model, oneriVerisi(i), { mutlakaGorunmeli: mutlaka });
  const dahil = (p: ReturnType<typeof plan>) => p.adimlar.filter((a) => a.dahil).map((a) => a.id);

  test('mutlu yol: üç adım, onay son adım; alanlar tip/doldurucu/konumla; bağlam profili', () => {
    const p = plan(0);
    expect(p.hatalar).toEqual([]);
    expect(dahil(p)).toEqual(['bilgiler', 'hesaplama', 'onay']);
    expect(p.adimlar.find((a) => a.sonAdim)?.id).toBe('onay');
    expect(p.beklenen).toEqual({ tur: 'basari' });
    expect(p.baglamProfili).toBe('Yetkili');
    expect(p.ekranUrl).toBe('/basvuru/');
    const alanlar = p.adimlar[0].alanlar.map((a) => [a.id, a.tip, a.secici, a.atla]);
    expect(alanlar).toEqual([
      ['urun', 'secim', '#urun', null], ['adSoyad', 'metin', '#adSoyad', null], ['baslangic', 'tarih', '#baslangic', null],
      ['kapsam', 'okluSecim', '#kapsam-deger', null], ['odemeTipi', 'radyo', 'input[name="odeme"]', null], ['kampanya', 'onayKutusu', '#kampanya', null],
      ['indirimOrani', 'metin', '#indirim', null], ['belge', 'dosya', '#belge', null]
    ]);
    expect(p.adimlar[0].alanlar.find((a) => a.id === 'kapsam')?.yardimci).toEqual({ ileri: '#kapsam-ileri', geri: '#kapsam-geri' });
    expect(p.adimlar[1].kosu?.aksiyonlar).toEqual([{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }]);
  });

  test('iş kuralı hatası: hesaplama adımında durur; isteğe bağlı adım kapsam dışı', () => {
    const p = plan(1);
    expect(p.beklenen).toEqual({ tur: 'hata', adim: 'hesaplama', mesaj: 'türkiye kapsamında "taksitli" ödeme seçilemez', mesajlar: ['türkiye kapsamında "taksitli" ödeme seçilemez'] });
    expect(dahil(p)).toEqual(['bilgiler', 'hesaplama']);
    expect(p.baglamProfili).toBe('Merkez');
  });

  test('isteğe bağlı adım hariç: prim hesaplanınca biter; "mutlaka görünmeli" alan işaretlenir', () => {
    expect(dahil(plan(4))).toEqual(['bilgiler', 'hesaplama']);
    expect(plan(4).adimlar.find((a) => a.sonAdim)?.id).toBe('hesaplama');
    const p = plan(3, ['indirimOrani']);
    expect(p.adimlar[0].alanlar.find((a) => a.id === 'indirimOrani')?.mutlakaGorunmeli).toBe(true);
    // Değeri olmayan "mutlaka görünmeli" alan yalnızca görünürlük için plana girer.
    const q = modelKosuPlani(model, { ...oneriVerisi(3), indirimOrani: undefined }, { mutlakaGorunmeli: ['indirimOrani'] });
    expect(q.adimlar[0].alanlar.find((a) => a.id === 'indirimOrani')).toMatchObject({ yalnizGorunurluk: true, mutlakaGorunmeli: true });
  });

  test('plan kurulamayan durumlar ve atlanacak alanlar', () => {
    const hata = modelKosuPlani(model, { ...oneriVerisi(0), beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'onay', mesaj: 'x' }, onayAdimiDahil: false });
    expect(hata.hatalar.join(' ')).toContain('adım kapsamında değil');
    const m = ornekBasvuruModeli();
    const alanlar = ((m.adimlar as Nesne[])[0].bolumler as Nesne[])[0].alanlar as Nesne[];
    delete (alanlar.find((a) => a.id === 'adSoyad') as Nesne).konum;
    const p = modelKosuPlani(m, oneriVerisi(0));
    expect(p.adimlar[0].alanlar.find((a) => a.id === 'adSoyad')?.atla).toBe('alanın konumu (seçicisi) modelde yok');
    expect(secenekBul([{ deger: '1', metin: 'Tekli', senaryoDegeri: 'tekli' }], 'tekli')).toEqual({ deger: '1', metin: 'Tekli', secici: null });
    expect(yuklemeDosyasiYolu('../gizli.txt', '/k', (a, b) => `${a}/${b}`)).toHaveProperty('hata');
    expect(yuklemeDosyasiYolu('a/b.txt', '/k', (a, b) => `${a}/${b}`)).toHaveProperty('hata');
    expect(yuklemeDosyasiYolu('belge.txt', '/k', (a, b) => `${a}/${b}`)).toEqual({ yol: '/k/belge.txt' });
  });
});

test.describe('Model senaryosu tespiti, başlıklar, yasaklı adresler', () => {
  test('model senaryosu: paketten ya da kosucu "model"; kodlu testlerden kalan içerik değil', () => {
    const paketli = { kaynak: { dosya: 'scenarios/ornek/x.spec.ts', ad: 'A' }, paket: { kaynak: 'sayfa-paketi' } };
    expect(modelSenaryosuMu(paketli)).toBe(true);
    expect(modelSenaryosuMu({ ...paketli, kosucu: 'kod' })).toBe(false);
    expect(modelSenaryosuMu({ kaynak: { dosya: 'scenarios/ornek/y.spec.ts', ad: 'B' }, veri: { dosya: 'ornek', yol: 'x' } })).toBe(false);
    expect(modelSenaryosuMu({ kosucu: 'model' })).toBe(true);
    expect(modelSenaryosuMu(null)).toBe(false);
    expect(modelEtiketi('ab-12')).toBe('@model-ab-12');
    expect(new RegExp(modelGrepDeseni('ab-12')).test('baslik @model-ab-12')).toBe(true);
    expect(new RegExp(modelGrepDeseni('ab-12')).test('baslik @model-ab-123')).toBe(false);
    const b = modelTestBasliklari([{ id: 'b2', baslik: 'Aynı' }, { id: 'a1', baslik: 'Aynı' }, { id: 'c3', baslik: 'Farklı' }]);
    expect([...b.entries()].sort()).toEqual([['a1', 'Aynı'], ['b2', 'Aynı (b2)'], ['c3', 'Farklı']]);
  });

  test('yasaklı host kalıpları (*yasakli* ve tam host)', () => {
    const d = yasakDesenleri('*yasakli*, eski-test.ornek.local ;  ');
    expect(d.map((x) => x.kalip)).toEqual(['*yasakli*', 'eski-test.ornek.local']);
    expect(adresYasakliMi('https://portal.ornek-sirket-yasakli.invalid/a', d)).toBe('*yasakli*');
    expect(adresYasakliMi('http://test.ornek-sirket-yasakli.local/', d)).toBe('*yasakli*');
    expect(adresYasakliMi('http://ESKI-TEST.ornek.local:8080/x', d)).toBe('eski-test.ornek.local');
    expect(adresYasakliMi('http://127.0.0.1:5581/', d)).toBeNull();
    expect(adresYasakliMi('/goreli/yol', d)).toBeNull();
    expect(adresYasakliMi('https://x.yasakli.invalid', [])).toBeNull();
  });
});

test.describe('Koşu hedefi ve liste (geçici veritabanı)', () => {
  test('model senaryosu model spec + etikete çözülür; kodlu testlerden kalan reddedilir; yasaklı adres reddedilir; liste', async () => {
    test.setTimeout(90_000);
    const klasor = geciciKlasor('model-hedef');
    try {
      const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
      await kasaOlustur(vt, 'Gecici-Model-Kasa-1', { kdf: HIZLI_KDF });
      // Nötr proje: elle kurulan proje + ortam, ekran ve senaryolar sayfa paketinden.
      const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
      const ortamId = ortamKaydet(vt, { projeId, ad: 'DENEME', tabanUrl: 'https://test.ornek.invalid', varsayilan: true });
      const ek = await sayfaEkle(vt, projeId, ornekBasvuruPaketi(), { senaryoIndeksleri: [0, 1], ortamIdleri: [ortamId], medyaKlasoru: join(klasor.yol, 'medya') });
      expect(ek.senaryoIdleri).toHaveLength(2);
      const s0 = senaryoGetir(vt, ek.senaryoIdleri[0]);
      expect(s0?.kosuyaDahil).toBe(false); // paketten: Koşuda kapalı başlar (kullanıcı karar verir)

      const hedef = calistirmaHedefiCoz(vt, projeId, ek.senaryoIdleri[0], ortamId);
      expect(hedef).toMatchObject({
        model: true, dosya: MODEL_SPEC_DOSYASI, ad: null, etiket: modelEtiketi(ek.senaryoIdleri[0]),
        grepDeseni: modelGrepDeseni(ek.senaryoIdleri[0]), genel: { projeId, ortamId }
      });
      expect(hedef).not.toHaveProperty('ortamAnahtari');
      // Kodlu testlerden kalma içerik (kosucu 'model' / paket yok): çalıştırılamaz.
      const kalinti = depoSenaryoKaydet(vt, {
        projeId, ekranId: s0?.ekranId ?? null, baslik: 'Eski kodlu test',
        icerik: { kaynak: { dosya: 'scenarios/ornek/eski.spec.ts', ad: 'Eski kodlu test' }, veri: { dosya: 'ornek', yol: 'x' }, ortamlar: { [ortamId]: {} } }
      });
      expect(() => calistirmaHedefiCoz(vt, projeId, kalinti, ortamId)).toThrow(/kodlu testlerden kalma/);

      // Liste: paket senaryoları model koşusu; kalıntı değil.
      const liste = senaryoListesi(vt, projeId, ortamId);
      expect(liste.senaryolar.filter((x) => x.modelKosusu).map((x) => x.id).sort()).toEqual([...ek.senaryoIdleri].sort());
      expect(liste.senaryolar.find((x) => x.id === kalinti)?.modelKosusu).toBe(false);

      // Yasaklı adres: ortam adresi kalıba uyarsa koşu hiç başlatılmaz.
      const yasak = yasakDesenleri('*yasakli*, test.ornek.invalid');
      const govde = { projeId, kosuId: 'k1', senaryoId: ek.senaryoIdleri[0], ortamId };
      expect(() => calistirmaIsteginiHazirla(vt, govde, { yasakDesenleri: yasak })).toThrow(/Koşu reddedildi: ortamın adresi \(test\.ornek\.invalid\) yasaklı adres kalıbına \("test\.ornek\.invalid"\)/);
      expect(() => calistirmaIsteginiHazirla(vt, { ...govde, senaryoId: kalinti }, { yasakDesenleri: yasak })).toThrow(/Koşu reddedildi/);
      const hazir = calistirmaIsteginiHazirla(vt, govde, { yasakDesenleri: yasakDesenleri('*yasakli*') });
      expect(hazir.hedef.model).toBe(true);
      expect(hazir).toMatchObject({ projeId, kosuId: 'k1', kosuTuru: null });
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });
});

test.describe('Tarayıcıda yasaklı adres koruması (yerel fikstür, DNS kapalı)', () => {
  test('yasaklı taban adres: tarayıcı hiçbir yere gitmeden hata; yasaklı host\'a sayfa isteği iptal edilir', async () => {
    const uygulama = await yerelSunucu(new OrnekBasvuruUygulamasi({ totp: false }).isle);
    const tarayici = await korumaliTarayici();
    try {
      const baglam = await tarayici.newContext();
      const istekler: string[] = [];
      baglam.on('request', (r) => { istekler.push(r.url()); });
      const page = await baglam.newPage();
      const desenler = yasakDesenleri('*yasakli*');
      await expect(yasakliAdresKorumasi(page, ['https://test.ornek-sirket-yasakli.local/'], desenler)).rejects.toThrow(/Tarayıcı hiçbir yere gitmedi/);
      expect(istekler).toEqual([]);

      const engellenen = await yasakliAdresKorumasi(page, [uygulama.adres], desenler);
      await page.goto(`${uygulama.adres}/giris`);
      await page.evaluate(() => fetch('https://ornek.yasakli.invalid/izleme').catch(() => null));
      expect(engellenen).toEqual(['ornek.yasakli.invalid']);
      expect(istekler.filter((u) => /yasakli/i.test(u))).toEqual(['https://ornek.yasakli.invalid/izleme']); // istek başladı ama iptal edildi (ağa çıkmadı)
      expect(uygulama.istekler).toEqual(['GET /giris']);
    } finally {
      await tarayici.close();
      await uygulama.kapat();
    }
  });
});
