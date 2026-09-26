// KORUMA TESTLERİ — platform "Senaryolar": model tabanlı form (şema, görünürlük, adım kapsamı,
// doğrulama eşlemesi), senaryo servisi (UUID kimlik, kaydet/kopyala/sil/geçmiş, şifreli veri),
// koşu hedefi çözümü (UUID → güncel test başlığı) ve çalıştırma uçlarının doğrulaması (SAHTE
// koşucuyla — gerçek koşu başlatılmaz), ayrıca testlerin veritabanındaki senaryolardan üretilmesi
// (yenidenKur + koşu listesi + "playwright test --list"). Model ve veri: SAHTE değerli örnekler
// (tests/birim/fixtures/ornek-eski-dosyalar/). Tarayıcı açmaz, siteye bağlanmaz; her test kendi geçici
// klasöründe çalışır.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur, parolayiDogrula, zarfMi } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ekranModeliEkle, kaynakEslemesiYaz, ortamKaydet, projeKaydet, senaryoKaydet as depoSenaryoKaydet,
  testVerisiProfiliKaydet, testVerisiTuruKaydet, veritabaniniHazirla, baglamProfiliKaydet
} from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { gorunurlukleriHesapla, ortakBaglaminiOlustur, senaryoyuDogrula } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import {
  aramaEslesiyorMu, beklenenHataOnerisi, beklenenSonucEtiketi, formDegerleriniKur, formSemasiOlustur, hataKontrolu, hatalariDagit,
  senaryoNesnesiOlustur, tumFormAlanlari
} from '../../scripts/platform/senaryolar/model-formu.mjs';
import {
  SenaryoDogrulamaHatasi, calistirmaHedefiCoz, denemePaketiOlustur, formBaglami, kosuyaDahilAyarla, senaryoDetayi, senaryoGecmisi,
  senaryoKaydet, senaryoKopyala, senaryoListesi, senaryolariSil
} from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { senaryoCalistir, senaryoDene, type KosuIstegi, type Kosucu } from '../../scripts/platform/senaryolar/calistirma.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import type { AktarimAdaptoru } from '../../projeler/index.d.mts';
import { ekranModeliniYukle } from '../support/ekran-modeli';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, ORNEK_MODEL_DOSYASI, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor, ornekVeri } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Senaryolar-Kasa-Parolasi-7';
const SPEC = 'scenarios/ornek/akis.spec.ts';
const yuklu = ekranModeliniYukle(ORNEK_MODEL_DOSYASI);
const MODEL = yuklu.model as unknown as Record<string, unknown>;
const ALT_MODELLER = yuklu.altModeller as unknown as Record<string, Record<string, unknown>>;
const sema = formSemasiOlustur(MODEL, ALT_MODELLER);
const dogrulamaBaglami = { model: MODEL, altModeller: ALT_MODELLER } as unknown as Parameters<typeof gorunurlukleriHesapla>[1];
const gorunurlukHesapla = (t: Record<string, unknown>) => gorunurlukleriHesapla(t, dogrulamaBaglami);
const TEMEL = {
  kapsam: 'AVRUPA', alternatif: 'VİZE SCHENGEN', covidTeminati: 'E', sorguTipi: 'tekli', ettiren: 'ayni', odemeAdimiDahil: false
};

// ---------------------------------------------------------------------------------------
// Model tabanlı form (saf)
// ---------------------------------------------------------------------------------------

test.describe('Model tabanlı form — şema', () => {
  test('adımlar akış sırasıyla; alan tipleri, zorunluluk, seçenekler ve bağımlılık modelden', () => {
    expect(sema.adimlar.map((a) => a.id)).toEqual(['ekranAcilir', 'policeBilgileri', 'sigortaliEttiren', 'primHesaplama', 'policelestirme', 'odeme']);
    const alan = (id: string) => tumFormAlanlari(sema).find((a) => a.id === id);
    expect(alan('kapsam')).toMatchObject({ tip: 'secim', anahtar: 'kapsam', zorunlu: true, adimId: 'policeBilgileri' });
    const alternatif = alan('alternatif');
    expect(alternatif?.tip === 'secim' && alternatif.bagimlilik?.alan).toBe('kapsam');
    expect(alan('kayakTeminati')).toMatchObject({ tip: 'onayKutusu', gorunurlukVar: true });
    expect(alan('cokluSorguDosyasi')).toMatchObject({ tip: 'dosya', kabul: '.xlsx' });
    expect(alan('cokluSorguKisiSayisi')).toMatchObject({ tip: 'sayi' });
    expect(alan('ettiren')).toMatchObject({ tip: 'secim', gorunum: 'radyo' });
    const ettirenKimlik = alan('ettirenKimlik');
    expect(ettirenKimlik).toMatchObject({ tip: 'kimlik', profilAnahtari: 'ettirenProfili', bagliAlan: 'ettiren', zorunlu: true });
    expect(ettirenKimlik?.tip === 'kimlik' && ettirenKimlik.kimlikAnahtarlari).toEqual(['ettirenOzelKimligi', 'ettirenTuzelKimligi']);
    expect(alan('acenteProfili')).toMatchObject({ tip: 'profil', profilHavuzu: 'ortak.kullaniciDegistir', varsayilanProfil: 'varsayilan' });
    // Senaryo düzeyindeki alt model ezmesi (kart) akıştaki yerine, ödeme adımına yerleşir.
    expect(alan('krediKarti')).toMatchObject({ tip: 'altModel', adimId: 'odeme' });
    const kart = alan('krediKarti');
    expect(kart?.tip === 'altModel' && kart.alanlar.map((a) => a.anahtar)).toEqual(['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']);
    // Ürün düzeyi / çıktı / aksiyon alanları formda yok.
    for (const yok of ['urunLinki', 'ulke', 'plan', 'primHesaplaButonu', 'baslangicTarihi', 'kosuyaDahil']) expect(alan(yok)).toBeUndefined();
  });

  test('isteğe bağlı adımlar = adım kapsamı; beklenen sonuç varyantları ve adım seçenekleri', () => {
    expect(sema.adimKapsami).toEqual([{ ayar: 'odemeAdimiDahil', alanId: 'odemeAdimiDahil', etiket: 'Ödeme adımını dahil et', adimlar: ['policelestirme', 'odeme'], zorunlu: true }]);
    expect(sema.adimlar.filter((a) => a.ayar).map((a) => a.id)).toEqual(['policelestirme', 'odeme']);
    expect(sema.beklenenSonuc).toMatchObject({ anahtar: 'beklenenSonuc', basariTipi: 'basarili', hataTipi: 'isKuraliHatasi', adimAnahtari: 'adim', mesajAnahtari: 'mesaj' });
    expect(sema.beklenenSonuc?.adimlar.map((s) => s.deger)).toEqual(['primHesaplama', 'policelestirme', 'odeme']);
  });

  test('görünürlük: koşullar tek doğrulayıcıdan; gizli alanlar ve kapsam dışı adımlar yazılmaz', () => {
    const d = formDegerleriniKur(sema, { ...TEMEL, sorguTipi: 'coklu', cokluSorguDosyasi: 'x.xlsx', cokluSorguKisiSayisi: 3 });
    d['sigortaliKimlik#kip'] = 'yeni';
    d['sigortaliKimlik.tcKimlikNo'] = '10000000146';
    d['krediKarti#ozel'] = true;
    d['krediKarti.kartNo'] = '4111111111111111';
    d.baslik = 'x';
    const g = gorunurlukHesapla(senaryoNesnesiOlustur(sema, d));
    expect(g.bolumler.sigortali).toBe(false); // çoklu sorguda sigortalı bölümü yok
    expect(g.adimlar.odeme).toBe(false); // ödeme adımı kapsam dışı
    expect(g.alanlar.ettirenKimlik).toBe(false); // ettiren "ayni"
    const s = senaryoNesnesiOlustur(sema, d, { gorunurlukHesapla });
    expect(s).toMatchObject({ sorguTipi: 'coklu', cokluSorguDosyasi: 'x.xlsx', cokluSorguKisiSayisi: 3, odemeAdimiDahil: false });
    expect(s).not.toHaveProperty('sigortaliKimligi');
    expect(s).not.toHaveProperty('krediKarti');
    // Bağlam profiline göre görünürlük (bilinen durum): 90001 acentesinde COVID görünmez → zorunlu değil.
    const ortak = { acenteProfilleri: { varsayilan: { acentePartaji: '90001' }, ozel: { acentePartaji: '90002' } } };
    const b = { ...dogrulamaBaglami, ortak } as Parameters<typeof gorunurlukleriHesapla>[1];
    expect(gorunurlukleriHesapla({ ...TEMEL }, b).alanlar.covidTeminati).toBe(false);
    expect(gorunurlukleriHesapla({ ...TEMEL, acenteProfili: 'ozel' }, b).alanlar.covidTeminati).toBe(true);
    expect(gorunurlukleriHesapla({ ...TEMEL, acenteProfili: 'bilinmeyen' }, { ...dogrulamaBaglami }).alanlar.covidTeminati).toBeNull();
  });

  test('örnek veri dosyası senaryoları formdan geri aynı JSON olarak çıkar (gidiş-dönüş)', () => {
    let sayi = 0;
    for (const ortam of ['test', 'canli'] as const) {
      for (const s of ornekVeri<{ jetSeyahat: { senaryolar: Array<Record<string, unknown>> } }>(ortam, 'jet-seyahat').jetSeyahat.senaryolar) {
        const geri = senaryoNesnesiOlustur(sema, formDegerleriniKur(sema, s), { gorunurlukHesapla, onceki: s });
        expect(JSON.stringify(geri), String(s.baslik)).toBe(JSON.stringify(s));
        sayi++;
      }
    }
    expect(sayi).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'gidis-donus', description: `${sayi} senaryo` });
  });

  test('doğrulayıcı hataları form kontrollerine dağılır; rozet ve "beklenen hata" önerisi modelden', () => {
    expect(hataKontrolu('ettirenOzelKimligi.tcKimlikNo', sema)).toBe('ettirenKimlik.tcKimlikNo');
    expect(hataKontrolu('ettirenProfili', sema)).toBe('ettirenKimlik#profil');
    expect(hataKontrolu('krediKarti.sonKullanmaYili', sema)).toBe('krediKarti.sonKullanmaYili');
    expect(hataKontrolu('beklenenSonuc.mesaj', sema)).toBe('beklenenSonuc.mesaj');
    expect(hataKontrolu('odemeAdimiDahil', sema)).toBe('odemeAdimiDahil');
    const sonuc = senaryoyuDogrula({ baslik: '', ...TEMEL, alternatif: 'YOK', ettiren: 'farkliOzel', ettirenOzelKimligi: { tcKimlikNo: '123', dogumTarihi: '01.01.1990', cepTelefonu: '5321234567' } }, dogrulamaBaglami);
    const dagit = hatalariDagit(sonuc.hatalar, sema);
    expect(Object.keys(dagit.alanlar).sort()).toEqual(['alternatif', 'baslik', 'ettirenKimlik.tcKimlikNo'].sort());
    expect(dagit.genel).toEqual([]);
    expect(beklenenSonucEtiketi(sema, { ...TEMEL, odemeAdimiDahil: true })).toMatchObject({ tur: 'basari', metin: 'Ödeme' });
    expect(beklenenSonucEtiketi(sema, TEMEL)).toMatchObject({ tur: 'basari', metin: 'Prim hesaplama' });
    expect(beklenenSonucEtiketi(sema, { ...TEMEL, beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'policelestirme', mesaj: 'm' } })).toMatchObject({ tur: 'hata', metin: 'Hata: Poliçeleştirme' });
    expect(beklenenHataOnerisi({ hataMesaji: 'Prim hesaplama adımında beklenen sonuç doğrulanamadı. Beklenen: x — Görülen: "Limit aşıldı"', basarisizAdim: 'Prim hesaplanır ve teklif oluşturulur' }, sema))
      .toEqual({ mesaj: 'Limit aşıldı', adim: 'primHesaplama' });
    expect(beklenenHataOnerisi({ hataMesaji: 'Error: "Poliçeleştirme" adımından sonra beklenmeyen bir hata pop-up\'ı görüntülendi, senaryo burada durduruldu: Kart reddedildi Tamam', basarisizAdim: 'Poliçeleştirme açılır ve kart bilgileri girilir' }, sema))
      .toEqual({ mesaj: 'Kart reddedildi', adim: 'policelestirme' });
    expect(beklenenHataOnerisi({ hataMesaji: 'Timeout 30000ms exceeded.' }, sema)).toBeNull();
    expect(aramaEslesiyorMu('ılk ATES', 'İlk Ateş Konut')).toBe(true);
    expect(aramaEslesiyorMu('konut dask', 'İlk Ateş Konut')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// Senaryo servisi + koşu hedefi + çalıştırma uçları (genel proje, sahte adaptör/koşucu)
// ---------------------------------------------------------------------------------------

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; digerOrtamId: string; ekranId: string; kodEkranId: string; kodSenaryo: string; veriSenaryo: string; temizle: () => void };

async function ortamKur(): Promise<Ortam> {
  const k = geciciKlasor('senaryolar');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'DENEME', tabanUrl: 'http://ornek.invalid', varsayilan: true });
  const digerOrtamId = ortamKaydet(vt, { projeId, ad: 'IKINCI', tabanUrl: 'http://ikinci.invalid' });
  kaynakEslemesiYaz(vt, { id: 'e-ortam-1', projeId, varlikTuru: 'ortam', kaynakAnahtari: 'test', varlikId: ortamId, kaynakOzeti: null });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek', ad: 'Örnek ekran' });
  ekranModeliEkle(vt, { ekranId, model: MODEL });
  const altId = ekranKaydet(vt, { projeId, anahtar: 'odeme-kredi-karti', ad: 'Ödeme' });
  ekranModeliEkle(vt, { ekranId: altId, model: ALT_MODELLER['odeme-kredi-karti.model.json'] });
  const kodEkranId = ekranKaydet(vt, { projeId, anahtar: 'kod', ad: 'Kod ekranı' });
  const tur = testVerisiTuruKaydet(vt, { projeId, ad: 'Özel kişi', alanlar: [{ ad: 'tcKimlikNo' }, { ad: 'dogumTarihi' }, { ad: 'cepTelefonu' }] });
  testVerisiProfiliKaydet(vt, { projeId, turId: tur, ad: 'tc1', degerler: { tcKimlikNo: '10000000146', dogumTarihi: '01.01.1990', cepTelefonu: '5321234567' } });
  baglamProfiliKaydet(vt, { projeId, tur: 'Acente', ad: 'ozel', alanlar: { acentePartaji: '90002' } });
  const veriSenaryo = depoSenaryoKaydet(vt, {
    projeId, ekranId, baslik: 'Mevcut veri senaryosu',
    icerik: { kaynak: { dosya: SPEC, ad: 'Mevcut veri senaryosu' }, veri: { dosya: 'ornek', yol: 'ornek.senaryolar' }, ortamlar: { [ortamId]: { sira: 0, veri: { baslik: 'Mevcut veri senaryosu', ...TEMEL } } } }
  });
  const kodSenaryo = depoSenaryoKaydet(vt, {
    projeId, ekranId: kodEkranId, baslik: 'Koddaki test', icerik: { kaynak: { dosya: 'scenarios/kod/a.spec.ts', ad: 'Koddaki test' }, ortamlar: { [ortamId]: {} } }
  });
  return { vt, projeId, ortamId, digerOrtamId, ekranId, kodEkranId, kodSenaryo, veriSenaryo, temizle: () => { vt.kapat(); k.temizle(); } };
}

const sahteAdaptor = {
  ad: 'sahte', projeAdi: 'Örnek', etiket: 'sahte',
  senaryoVeriKaynagi: (e: string) => (e === 'ornek' ? { spec: SPEC, dosya: 'ornek', yol: 'ornek.senaryolar' } : null),
  profilHavuzlari: () => ({ 'ortak.kullaniciDegistir': { tur: 'baglam' as const, ad: 'Acente' }, 'ortak.kimlikBilgileri.ozel': { tur: 'testVerisi' as const, ad: 'Özel kişi' } }),
  dogrulamaBaglami: () => ortakBaglaminiOlustur({ kimlikBilgileri: { ozel: { tc1: {} }, tuzel: {} }, kullaniciDegistir: { varsayilan: { acentePartaji: '90001' }, ozel: { acentePartaji: '90002' } } }) as Record<string, unknown>
} as unknown as AktarimAdaptoru;

test.describe('Senaryo servisi (genel proje)', () => {
  test('oluştur (doğrulama + şifreli veri), yeniden adlandır, kopyala, sil, Koşuda, geçmiş ve liste', async () => {
    const o = await ortamKur();
    try {
      const { vt, projeId, ortamId, ekranId } = o;
      // Doğrulama: alan bazında hata (tek doğrulayıcı), hiçbir şey yazılmaz.
      let hata: unknown;
      try { senaryoKaydet(vt, { projeId, ekranId, baslik: 'Yeni', veri: { kapsam: 'DÜNYA' }, ortamIdleri: [ortamId] }, { adaptor: sahteAdaptor }); } catch (e) { hata = e; }
      expect(hata).toBeInstanceOf(SenaryoDogrulamaHatasi);
      expect((hata as SenaryoDogrulamaHatasi).hatalar.map((x) => x.alan)).toEqual(expect.arrayContaining(['alternatif', 'sorguTipi', 'ettiren', 'odemeAdimiDahil']));
      expect(() => senaryoKaydet(vt, { projeId, ekranId, baslik: 'Yeni', veri: { ...TEMEL, acenteProfili: 'yok' }, ortamIdleri: [ortamId] }, { adaptor: sahteAdaptor })).toThrow(/profil/);
      expect(() => senaryoKaydet(vt, { projeId, ekranId, baslik: 'Mevcut veri senaryosu', veri: TEMEL, ortamIdleri: [ortamId] }, { adaptor: sahteAdaptor })).toThrow(/zaten var/);
      const sayi = () => Number(vt.tek('SELECT COUNT(*) AS n FROM senaryolar')?.n);
      expect(sayi()).toBe(2);

      const { id } = senaryoKaydet(vt, {
        projeId, ekranId, baslik: '  Yeni   senaryo ', ortamIdleri: [ortamId], kosuyaDahil: true, mutlakaGorunmeli: ['covidTeminati'],
        veri: { ...TEMEL, ettiren: 'farkliOzel', ettirenOzelKimligi: { tcKimlikNo: '10000000146', dogumTarihi: '01.01.1990', cepTelefonu: '5321234567' }, acenteProfili: 'ozel' }
      }, { adaptor: sahteAdaptor });
      const ham = JSON.parse(String(vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ?', [id])?.icerik_json));
      expect(ham.kaynak).toEqual({ dosya: SPEC, ad: 'Yeni senaryo' });
      expect(ham.ortamlar[ortamId].sira).toBe(1);
      expect(zarfMi(ham.ortamlar[ortamId].veri.ettirenOzelKimligi.tcKimlikNo), 'hassas değer kasa zarfı olmalı').toBe(true);
      expect(readFileSync(join(String(vt.yol))).includes(Buffer.from('10000000146'))).toBe(false);
      expect(senaryoDetayi(vt, id, ortamId)).toMatchObject({ baslik: 'Yeni senaryo', mutlakaGorunmeli: ['covidTeminati'], veri: { baslik: 'Yeni senaryo', ettirenOzelKimligi: { tcKimlikNo: '10000000146' } } });

      // UUID → güncel test başlığı; yeniden adlandırınca kaynak ve verideki başlık birlikte değişir.
      expect(calistirmaHedefiCoz(vt, projeId, id, ortamId)).toMatchObject({ dosya: SPEC, ad: 'Yeni senaryo', ortamAnahtari: 'test' });
      senaryoKaydet(vt, { id, projeId, baslik: 'Yeni ad' }, { adaptor: sahteAdaptor });
      expect(calistirmaHedefiCoz(vt, projeId, id, ortamId).ad).toBe('Yeni ad');
      expect(senaryoDetayi(vt, id, ortamId).veri?.baslik).toBe('Yeni ad');
      expect(() => calistirmaHedefiCoz(vt, projeId, id, o.digerOrtamId)).toThrow(/ortamda tanımlı değil/);
      expect(() => calistirmaHedefiCoz(vt, projeId, 'olmayan-id', ortamId)).toThrow(/bulunamadı/);
      expect(() => calistirmaHedefiCoz(vt, projeId, '../x', ortamId)).toThrow(/Geçersiz/);
      // Koşan senaryo düzenlenemez.
      expect(() => senaryoKaydet(vt, { id, projeId, baslik: 'Başka' }, { kosuyorMu: (d, a) => d === SPEC && a === 'Yeni ad' })).toThrow(/koşuyor/);

      const kopya = senaryoKopyala(vt, projeId, id);
      expect(kopya.baslik).toBe('Yeni ad (kopya)');
      expect(senaryoKopyala(vt, projeId, id).baslik).toBe('Yeni ad (kopya 2)');
      expect(senaryoDetayi(vt, kopya.id, ortamId)).toMatchObject({ kosuyaDahil: false, veri: { baslik: 'Yeni ad (kopya)' } });
      expect(() => senaryoKopyala(vt, projeId, o.kodSenaryo)).toThrow(/kopyalanamaz/);

      expect(kosuyaDahilAyarla(vt, projeId, [id, o.kodSenaryo], false).degisen).toBe(2);
      expect(() => senaryolariSil(vt, projeId, [kopya.id, o.kodSenaryo])).toThrow(/kodda tanımlı/);
      expect(senaryolariSil(vt, projeId, [kopya.id]).silinen).toBe(1);
      // Kodda tanımlı senaryoda yalnızca görünen başlık + Koşuda değişir (kaynak aynı kalır).
      senaryoKaydet(vt, { id: o.kodSenaryo, projeId, baslik: 'Görünen ad', kosuyaDahil: true });
      expect(calistirmaHedefiCoz(vt, projeId, o.kodSenaryo, ortamId).ad).toBe('Koddaki test');

      const gecmis = senaryoGecmisi(vt, id);
      expect(gecmis.map((g) => g.islem)).toEqual(['guncelle', 'guncelle', 'olustur']);
      expect(gecmis[0].degisenler).toEqual(['Koşuda: açık → kapalı']);
      expect(gecmis[1].degisenler).toEqual(['Başlık: "Yeni senaryo" → "Yeni ad"']);
      expect(JSON.stringify(gecmis)).not.toContain('10000000146');

      // Liste: son sonuç (senaryo kimliğine), bağlam profili, beklenen sonuç rozeti, ekranlar.
      kosuKaydet(vt, { id: 'kosu-1', projeId, ortamId, tur: 'tekil' });
      sonucKaydet(vt, { kosuId: 'kosu-1', projeId, senaryoId: id, senaryoBaslik: 'Yeni ad', durum: 'basarisiz', bitis: '2026-09-25T10:00:00.000Z' });
      const liste = senaryoListesi(vt, projeId, ortamId, sahteAdaptor);
      const satir = liste.senaryolar.find((s) => s.id === id);
      expect(satir).toMatchObject({ baslik: 'Yeni ad', kosuyaDahil: false, veriGudumlu: true, modelVar: true, baglamProfili: { ad: 'ozel', varsayilan: false }, beklenenSonuc: { tur: 'basari', metin: 'Prim hesaplama' }, sonSonuc: { durum: 'basarisiz' }, mutlakaGorunmeliSayisi: 1 });
      expect(liste.senaryolar.find((s) => s.id === o.veriSenaryo)?.baglamProfili).toMatchObject({ varsayilan: true, ad: 'varsayilan' });
      expect(liste.ekranlar.map((e) => e.anahtar)).toEqual(expect.not.arrayContaining(['odeme-kredi-karti']));
      expect(liste.ekranlar.find((e) => e.id === ekranId)).toMatchObject({ olusturulabilir: true, modelVar: true });
      expect(senaryoListesi(vt, projeId, o.digerOrtamId).senaryolar).toEqual([]);

      // Form bağlamı: test verisi profili MASKELİ (değer yok), tarayıcıya yalnızca profil anahtarları.
      const fb = formBaglami(vt, projeId, ekranId, ortamId, sahteAdaptor);
      expect(fb.profiller['ortak.kimlikBilgileri.ozel']).toEqual([{ ad: 'tc1', tur: 'testVerisi', kapsam: 'tum', alanlar: expect.arrayContaining([{ etiket: 'tcKimlikNo', dolu: true }]) }]);
      expect(JSON.stringify(fb)).not.toContain('10000000146');
      expect(fb.ortak).toMatchObject({ kimlikProfilleri: { ozel: { tc1: {} } }, acenteProfilleri: { ozel: { acentePartaji: '90002' } } });
    } finally { o.temizle(); }
  });

  test('çalıştırma ucu: gövde doğrulanır, UUID sunucuda çözülür, SAHTE koşucu çağrılır; Dene veritabanına yazmaz', async () => {
    const o = await ortamKur();
    try {
      const { vt, projeId, ortamId, ekranId } = o;
      const istekler: KosuIstegi[] = [];
      const denemeler: Array<Record<string, unknown>> = [];
      const kosucu: Kosucu = {
        calistir: async (i) => { istekler.push(i); return { govde: { basarili: true, durum: 'passed', sureMs: 5 } }; },
        dene: async (i) => { denemeler.push(i as unknown as Record<string, unknown>); return { govde: { basarili: true, durum: 'failed', hataMesaji: 'x' } }; }
      };
      const govde = { projeId, ortamId, senaryoId: o.veriSenaryo, kosuId: 'k1' };
      await expect(senaryoCalistir(vt, { ...govde, kosuId: 'a b' }, kosucu)).rejects.toThrow(/kosuId/);
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'hepsi' }, kosucu)).rejects.toThrow(/kosuTuru/);
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'tam' }, kosucu)).rejects.toThrow(/kosuKimligi/);
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'tam', kosuKimligi: 'g-1', kosuKapsami: 'Olmayan ekran' }, kosucu)).rejects.toThrow(/kosuKapsami/);
      await expect(senaryoCalistir(vt, { ...govde, senaryoId: 'olmayan' }, kosucu)).rejects.toThrow(/bulunamadı/);
      await expect(senaryoCalistir(vt, { ...govde, ortamId: o.digerOrtamId }, kosucu)).rejects.toThrow(/ortamda tanımlı değil/);
      await expect(senaryoCalistir(vt, govde, null)).rejects.toThrow(/etkin değil/);
      // Kodlu teste bağlı senaryo koşmaz (kodlu testler kaldırıldı); koşucuya hiç istek gitmez.
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'tam', kosuKimligi: 'g-1', kosuKapsami: 'Örnek ekran', dosya: 'kotu.spec.ts', senaryoAdi: 'kötü' }, kosucu))
        .rejects.toThrow(/kodlu testler kaldırıldı/);
      expect(istekler).toEqual([]);

      const once = vt.tek('SELECT COUNT(*) AS n, MAX(guncellenme) AS g FROM senaryolar');
      await expect(senaryoDene(vt, { projeId, ekranId, ortamId, kosuId: 'd1', veri: { kapsam: 'DÜNYA' } }, kosucu, sahteAdaptor)).rejects.toThrow(SenaryoDogrulamaHatasi);
      const d = await senaryoDene(vt, { projeId, ekranId, ortamId, kosuId: 'd1', veri: { ...TEMEL, ettiren: 'farkliOzel', ettirenProfili: 'tc1' } }, kosucu, sahteAdaptor);
      expect(d.govde).toMatchObject({ basarili: true, durum: 'failed' });
      expect(denemeler).toHaveLength(1);
      expect(denemeler[0]).toMatchObject({ ortam: 'test', dosya: SPEC, kosuId: 'd1', ekVeri: { ortam: 'test', ekVeriler: [{ dosya: 'ornek', yol: ['ornek', 'senaryolar'] }] } });
      expect(String(denemeler[0].ad)).toMatch(/^__senaryo_deneme__ [a-f0-9]{8}$/);
      expect(vt.tek('SELECT COUNT(*) AS n, MAX(guncellenme) AS g FROM senaryolar')).toEqual(once);
      const paket = denemePaketiOlustur(vt, { projeId, ekranId, ortamId, veri: TEMEL }, { adaptor: sahteAdaptor, geciciEk: 'abcd1234' });
      expect("ekVeri" in paket && paket.ekVeri.ekVeriler[0].ogeler).toEqual([{ ...TEMEL, baslik: '__senaryo_deneme__ abcd1234' }]);
    } finally { o.temizle(); }
  });
});

// ---------------------------------------------------------------------------------------
// Testler veritabanındaki senaryolardan üretilir (örnek eski dosyalar, geçici veritabanı)
// ---------------------------------------------------------------------------------------

function altSurecOrtami(ek: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|PLATFORM_)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...ek };
}
function testListesi(ek: Record<string, string>): string[] {
  const r = spawnSync(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--list', '--reporter=json', 'scenarios/jet-seyahat/'], {
    cwd: KOK, env: altSurecOrtami(ek), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  type Suite = { file?: string; suites?: Suite[]; specs?: Array<{ file?: string; title: string }> };
  const veri = JSON.parse(r.stdout) as Suite;
  const liste: string[] = [];
  (function gez(s: Suite): void {
    for (const alt of s.suites ?? []) gez(alt);
    for (const sp of s.specs ?? []) liste.push(sp.title);
  })(veri);
  return liste;
}

test.describe('Testler veritabanındaki senaryolardan üretilir', () => {
// Galaksi temizliği A aşaması: kodlu testler (tests/scenarios) silindi; bu test eski "kodlu test" yolunu sınıyor —
// C aşamasında model tabanlı örnekle yeniden yazılacak ya da kaldırılacak.
  test.fixme('oluşturulan senaryo listede, yeni başlık listede, silinen yok; Koşuda varsayılan listeyi etkiler', async () => {
    test.setTimeout(120_000);
    const k = geciciKlasor('senaryo-uretim');
    try {
      const yol = join(k.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const adaptor = adaptorBul('galaksi');
      if (!adaptor) throw new Error('galaksi adaptörü yok');
      const { projeId } = aktarimiUygula(vt, await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] }));
      const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
      const ekranId = String(vt.tek("SELECT id FROM ekranlar WHERE anahtar = 'jet-seyahat'")?.id);
      const dizi = () => ((adaptor.yenidenKur(vt, projeId, 'test')?.dosyalar['jet-seyahat'] as { jetSeyahat: { senaryolar: Array<{ baslik: string }> } }).jetSeyahat.senaryolar);
      const dosyadakiler = dizi().map((s) => s.baslik);
      expect(dosyadakiler.length).toBeGreaterThan(0);

      const { id } = senaryoKaydet(vt, { projeId, ekranId, baslik: 'Platformda oluşturulan senaryo', veri: { ...TEMEL }, ortamIdleri: [ortamId], kosuyaDahil: true }, { adaptor });
      const sil = dosyadakiler[0];
      const silId = String(vt.tumu('SELECT id, icerik_json FROM senaryolar').find((s) => JSON.parse(String(s.icerik_json)).kaynak?.ad === sil)?.id);
      senaryolariSil(vt, projeId, [silId]);
      const yeniAd = dosyadakiler[1];
      const yeniAdId = String(vt.tumu('SELECT id, icerik_json FROM senaryolar').find((s) => JSON.parse(String(s.icerik_json)).kaynak?.ad === yeniAd)?.id);
      senaryoKaydet(vt, { id: yeniAdId, projeId, baslik: `${yeniAd} (yeniden adlandırıldı)`, kosuyaDahil: true }, { adaptor });
      kosuyaDahilAyarla(vt, projeId, [id], false);

      const beklenen = [...dosyadakiler.filter((b) => b !== sil).map((b) => (b === yeniAd ? `${yeniAd} (yeniden adlandırıldı)` : b)), 'Platformda oluşturulan senaryo'];
      expect(dizi().map((s) => s.baslik)).toEqual(beklenen);
      const haric = adaptor.kosudanHaricAnahtarlar(vt, projeId);
      expect(haric).toContain('scenarios/jet-seyahat/prim-hesaplama.spec.ts::Platformda oluşturulan senaryo');
      const kimlikler = adaptor.yenidenKur(vt, projeId, 'test')?.senaryoKimlikleri ?? {};
      expect(kimlikler['scenarios/jet-seyahat/prim-hesaplama.spec.ts::Platformda oluşturulan senaryo']).toBe(id);
      expect(kimlikler[`scenarios/jet-seyahat/prim-hesaplama.spec.ts::${yeniAd} (yeniden adlandırıldı)`]).toBe(yeniAdId);
      const anahtar = (await parolayiDogrula(vt, PAROLA))?.toString('base64url') ?? '';
      vt.kapat();

      // Playwright listesi veritabanından (anahtar + geçici veritabanı): tümü ve varsayılan (Koşuda) liste.
      const ortak = { TEST_ENV: 'test', PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar };
      const tumu = testListesi({ ...ortak, TEST_SUNUCU_TUM_LISTE: '1' });
      expect(tumu).toEqual(beklenen);
      const varsayilan = testListesi(ortak);
      expect(varsayilan).not.toContain('Platformda oluşturulan senaryo');
      expect(varsayilan).toContain(`${yeniAd} (yeniden adlandırıldı)`);
      test.info().annotations.push({ type: 'liste', description: `tümü ${tumu.length}, varsayılan ${varsayilan.length}` });
    } finally { k.temizle(); }
  });
});
